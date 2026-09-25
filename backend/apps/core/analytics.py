"""Server-side portfolio analytics.

Replaces the previous client-side approach, which paged up to ~1,200
recommendations into the browser and aggregated them in JavaScript. That was
slow, silently truncated on larger municipalities, and shipped every
recommendation's full text to the client just to draw a bar chart.

Everything here is a grouped aggregate over the caller's own scoped queryset,
so municipality and role scoping are preserved and the payload is a few KB
regardless of how many recommendations exist.

The payload is cached briefly (see `cached_analytics`): the aggregates scan
the whole scoped portfolio, and several people in the same scope open the
analytics page with nothing changed in between.
"""
import time

from django.core.cache import cache
from django.db import connection, transaction
from django.db.models import Avg, Count, Q, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from apps.audits.models import (
    OPEN_STATUSES,
    OVERDUE_ACTIVE_STATUSES,
    Recommendation,
)
from apps.core.permissions import recommendation_scope_key, scope_recommendations

S = Recommendation.Status

# Upper bound on staleness if a change ever bypasses model signals
# (e.g. a raw queryset.update() in a shell). Normal writes invalidate at once.
ANALYTICS_CACHE_SECONDS = 90
_GENERATION_KEY = "analytics:generation"


def bump_analytics_generation():
    """Invalidate every cached analytics payload.

    Keys embed this generation, so changing it orphans all old entries (they
    expire on their own). Global rather than per-municipality: writes are
    rare next to reads, and this avoids a lookup on every save.
    """
    cache.set(_GENERATION_KEY, time.time_ns(), None)


def invalidate_analytics(**_kwargs):
    """Signal receiver for writes that can change any analytics number.

    Bumps immediately, and again after commit when inside a transaction: a
    request computing analytics between the first bump and the commit would
    otherwise cache pre-commit numbers under the new generation.
    """
    bump_analytics_generation()
    if connection.in_atomic_block:
        transaction.on_commit(bump_analytics_generation)


def cached_analytics(user, *, months=12):
    """`build_analytics` for this user's scope, cached per scope.

    The key carries everything that changes the result: the user's scope
    (see `recommendation_scope_key`), the window, and today's date (overdue
    is relative to it). Users with identical scopes share an entry; users
    with different scopes never do.
    """
    generation = cache.get(_GENERATION_KEY, 0)
    key = (
        f"analytics:{generation}:{recommendation_scope_key(user)}"
        f":{months}:{timezone.localdate().isoformat()}"
    )
    payload = cache.get(key)
    if payload is None:
        queryset = scope_recommendations(Recommendation.objects.all(), user)
        payload = build_analytics(queryset, months=months)
        cache.set(key, payload, ANALYTICS_CACHE_SECONDS)
    return payload

# Work the department is actively executing, as opposed to merely open
# (which also counts items sitting in review or approval queues).
IN_EXECUTION_STATUSES = (
    S.IN_PROGRESS,
    S.PARTIAL,
    S.RETURNED_INSUFFICIENT,
    S.REOPENED,
    S.PENDING_HEAD_REVIEW,
)


def _overdue_q():
    return Q(
        status__in=OVERDUE_ACTIVE_STATUSES,
        action_plan__target_date__lt=timezone.localdate(),
    )


def _counts_by(queryset, field):
    """{value: count} for one column, in a single GROUP BY."""
    return {
        row[field]: row["count"]
        for row in queryset.values(field).annotate(count=Count("id"))
        if row[field] is not None
    }


def build_analytics(queryset, *, months=12):
    """One analytics payload from a handful of aggregate queries."""
    overdue_q = _overdue_q()

    totals = queryset.aggregate(
        total=Count("id"),
        closed=Count("id", filter=Q(status=S.CLOSED)),
        open=Count("id", filter=Q(status__in=OPEN_STATUSES)),
        overdue=Count("id", filter=overdue_q),
        high_risk_open=Count(
            "id",
            filter=Q(risk_level=Recommendation.RiskLevel.HIGH, status__in=OPEN_STATUSES),
        ),
        recurring_confirmed=Count(
            "id", filter=Q(is_recurring=True, recurrence_confirmed=True)
        ),
        recurring_flagged=Count(
            "id", filter=Q(is_recurring=True, recurrence_confirmed=False)
        ),
        with_plan=Count("id", filter=Q(action_plan__isnull=False)),
    )
    total = totals["total"] or 0
    closed = totals["closed"] or 0
    open_count = totals["open"] or 0

    totals["completion_rate"] = round(closed / total * 100, 1) if total else 0.0
    totals["overdue_rate"] = (
        round((totals["overdue"] or 0) / open_count * 100, 1) if open_count else 0.0
    )

    # Department performance: one grouped query, not one query per department.
    departments = [
        {
            "department": row["report__department_id"],
            "name": row["report__department__name"],
            "total": row["total"],
            "open": row["open"],
            "closed": row["closed"],
            "overdue": row["overdue"],
            "in_progress": row["in_progress"],
            "high_risk": row["high_risk"],
            "recurring": row["recurring"],
            "execution_rate": (
                round(row["closed"] / row["total"] * 100, 1) if row["total"] else 0.0
            ),
        }
        for row in queryset.values(
            "report__department_id", "report__department__name"
        ).annotate(
            total=Count("id"),
            open=Count("id", filter=Q(status__in=OPEN_STATUSES)),
            closed=Count("id", filter=Q(status=S.CLOSED)),
            overdue=Count("id", filter=overdue_q),
            in_progress=Count("id", filter=Q(status__in=IN_EXECUTION_STATUSES)),
            high_risk=Count("id", filter=Q(risk_level=Recommendation.RiskLevel.HIGH)),
            recurring=Count("id", filter=Q(is_recurring=True, recurrence_confirmed=True)),
        )
    ]
    departments.sort(key=lambda row: (-row["overdue"], -row["total"]))

    # Volume over time, from the database's own date truncation.
    cutoff = timezone.localdate().replace(day=1)
    month = cutoff.month - (months - 1)
    year = cutoff.year
    while month <= 0:
        month += 12
        year -= 1
    cutoff = cutoff.replace(year=year, month=month)
    volume = [
        {
            "month": row["month"].date().isoformat()
            if hasattr(row["month"], "date")
            else str(row["month"]),
            "created": row["created"],
            "closed": row["closed"],
        }
        for row in queryset.filter(created_at__date__gte=cutoff)
        .annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(
            created=Count("id"),
            closed=Count("id", filter=Q(status=S.CLOSED)),
        )
        .order_by("month")
    ]

    # Average step completion across plans that actually have steps.
    progress = queryset.filter(action_plan__steps__isnull=False).aggregate(
        average_step_progress=Coalesce(
            Avg("action_plan__steps__progress_percent"), Value(0.0)
        ),
        steps_total=Count("action_plan__steps"),
        steps_done=Count(
            "action_plan__steps", filter=Q(action_plan__steps__is_done=True)
        ),
    )
    steps_total = progress["steps_total"] or 0
    implementation = {
        "average_step_progress": round(float(progress["average_step_progress"] or 0), 1),
        "steps_total": steps_total,
        "steps_done": progress["steps_done"] or 0,
        "steps_completion_rate": (
            round((progress["steps_done"] or 0) / steps_total * 100, 1)
            if steps_total
            else 0.0
        ),
    }

    return {
        "generated_at": timezone.now().isoformat(),
        "totals": totals,
        "by_status": _counts_by(queryset, "status"),
        "by_risk": _counts_by(queryset.filter(status__in=OPEN_STATUSES), "risk_level"),
        "by_engagement_type": _counts_by(queryset, "report__engagement_type"),
        "by_department": departments,
        "volume": volume,
        "implementation": implementation,
        "recurrence": {
            "confirmed": totals["recurring_confirmed"],
            "awaiting_confirmation": totals["recurring_flagged"],
        },
    }
