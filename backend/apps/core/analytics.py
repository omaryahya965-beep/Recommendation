"""Server-side portfolio analytics.

Every number is a grouped aggregate over the caller's own scoped queryset, so
municipality and role scoping are preserved and the payload stays small
regardless of how many recommendations exist. The payload is cached briefly
per scope (see `cached_analytics`).

Definitions (one base for every rate, so no two screens can disagree):

  operational total  issued recommendations (status != draft). The base of
                     every count and rate below. Unissued drafts are internal
                     audit working material and are reported separately as
                     `drafts` (audit only; zero for everyone else).
  open / closed      operational and not closed / closed; closed is split by
                     resolution (implemented vs disagreement accepted).
  completion rate    closed / operational total.
  overdue            department overdue: the binding deadline (plan date, or
                     the audit-set deadline after a partial/insufficient
                     verification, W1) has passed while the department owns
                     the next action (W2).
  overdue rate       overdue / open cases that have a binding deadline (a case
                     without a deadline cannot be late).
  high-risk open     risk = high and open (also per department).
  in execution       in progress, returned, partial, reopened.
  awaiting ...       head review / verification / closure (audit, council).
  department
  execution rate     closed as implemented / cases that reached the action
                     plan stage or later, excluding accepted disagreements.
  average progress   mean of per-case plan progress over open cases in
                     execution only.
  created per month  operational recommendations by created_at month.
  closed per month   closed recommendations by closed_at month. The two
                     series are never mixed.
"""
import time
from collections import defaultdict
from statistics import mean

from django.core.cache import cache
from django.db import connection, transaction
from django.db.models import Avg, Count, OuterRef, Q, Subquery
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.audits.models import (
    AUDIT_QUEUE_STATUSES,
    COUNCIL_QUEUE_STATUSES,
    DEPARTMENT_DEADLINE_STATUSES,
    Recommendation,
)
from apps.core.permissions import recommendation_scope_key, scope_recommendations

S = Recommendation.Status
R = Recommendation.Resolution

# Upper bound on staleness if a change ever bypasses model signals
# (e.g. a raw queryset.update() in a shell). Normal writes invalidate at once.
ANALYTICS_CACHE_SECONDS = 90
_GENERATION_KEY = "analytics:generation"

# Work the department is actively executing (the "execution" stage).
IN_EXECUTION_STATUSES = (S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)

# Statuses from the action-plan stage onwards (execution-rate denominator).
FROM_PLAN_STAGE_STATUSES = (
    S.ACTION_PLAN_REQUIRED, S.ACTION_PLAN_REVIEW, S.REVISION_REQUIRED, S.ACTION_PLAN_APPROVED,
    S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED, S.PENDING_HEAD_REVIEW,
    S.SUBMITTED_FOR_VERIFICATION, S.CLOSURE_REVIEW, S.PENDING_CLOSURE_COUNCIL,
)

AGING_BUCKETS = ((1, 30), (31, 90), (91, None))


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


def _rate(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


def _counts_by(queryset, field):
    """{value: count} for one column, in a single GROUP BY."""
    return {
        row[field]: row["count"]
        for row in queryset.values(field).annotate(count=Count("id"))
        if row[field] is not None
    }


def portfolio_totals(operational, today=None):
    """The headline numbers over an operational (non-draft) queryset.

    Shared by /api/analytics/ and the role dashboards so their KPIs agree.
    """
    from apps.workflow.presentation import annotate_workflow, overdue_q

    today = today or timezone.localdate()
    annotated = annotate_workflow(operational)
    open_q = ~Q(status=S.CLOSED)
    totals = annotated.aggregate(
        total=Count("id"),
        open=Count("id", filter=open_q),
        closed=Count("id", filter=Q(status=S.CLOSED)),
        closed_implemented=Count("id", filter=Q(status=S.CLOSED, resolution=R.IMPLEMENTED)),
        closed_disagreement=Count("id", filter=Q(status=S.CLOSED, resolution=R.DISAGREEMENT_ACCEPTED)),
        overdue=Count("id", filter=overdue_q(today)),
        overdue_base=Count(
            "id", filter=Q(status__in=DEPARTMENT_DEADLINE_STATUSES, binding_deadline__isnull=False)
        ),
        high_risk_open=Count("id", filter=open_q & Q(risk_level=Recommendation.RiskLevel.HIGH)),
        in_execution=Count("id", filter=Q(status__in=IN_EXECUTION_STATUSES)),
        awaiting_head_review=Count("id", filter=Q(status=S.PENDING_HEAD_REVIEW)),
        awaiting_verification=Count("id", filter=Q(status=S.SUBMITTED_FOR_VERIFICATION)),
        awaiting_closure_audit=Count("id", filter=Q(status=S.CLOSURE_REVIEW)),
        awaiting_closure_council=Count("id", filter=Q(status=S.PENDING_CLOSURE_COUNCIL)),
        awaiting_ratification=Count("id", filter=Q(status=S.PENDING_COUNCIL)),
        awaiting_response=Count(
            "id", filter=Q(status__in=(S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION))
        ),
        response_overdue=Count(
            "id",
            filter=Q(
                status__in=(S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION),
                report__response_deadline__lt=today,
            ),
        ),
        late_in_review=Count(
            "id",
            filter=Q(status__in=AUDIT_QUEUE_STATUSES + COUNCIL_QUEUE_STATUSES)
            & Q(action_plan__target_date__lt=today),
        ),
        recurring_confirmed=Count("id", filter=Q(is_recurring=True, recurrence_confirmed=True)),
        recurring_flagged=Count("id", filter=Q(is_recurring=True, recurrence_confirmed=False)),
        with_plan=Count("id", filter=Q(action_plan__isnull=False)),
    )
    totals = {key: value or 0 for key, value in totals.items()}
    totals["completion_rate"] = _rate(totals["closed"], totals["total"])
    totals["overdue_rate"] = _rate(totals["overdue"], totals["overdue_base"])
    # Kept for older readers: "in progress" meant the execution stage.
    totals["in_progress"] = totals["in_execution"]
    return totals


def _monthly_series(operational, months):
    """Created per month (created_at) and closed per month (closed_at),
    computed separately and merged on the month key."""
    first = timezone.localdate().replace(day=1)
    month, year = first.month - (months - 1), first.year
    while month <= 0:
        month += 12
        year -= 1
    cutoff = first.replace(year=year, month=month)

    def series(queryset, field):
        return {
            row["month"].date().isoformat() if hasattr(row["month"], "date") else str(row["month"]): row["count"]
            for row in queryset.filter(**{f"{field}__date__gte": cutoff})
            .annotate(month=TruncMonth(field))
            .values("month")
            .annotate(count=Count("id"))
            .order_by("month")
        }

    created = series(operational, "created_at")
    closed = series(operational.filter(status=S.CLOSED, closed_at__isnull=False), "closed_at")
    keys = []
    cursor = cutoff
    while cursor <= first:
        keys.append(cursor.isoformat())
        cursor = cursor.replace(year=cursor.year + (cursor.month == 12), month=cursor.month % 12 + 1)
    return [{"month": key, "created": created.get(key, 0), "closed": closed.get(key, 0)} for key in keys]


def _queues(annotated, today):
    """How long cases have waited in each owner's queue (days since they
    entered their current status)."""
    from apps.workflow.presentation import NEXT_ROLE, ROLE_SIDE

    ages = defaultdict(list)
    rows = annotated.exclude(status=S.CLOSED).values_list("status", "status_entered_at", "report__status")
    for status, entered, report_status in rows:
        side = ROLE_SIDE.get(NEXT_ROLE.get(status))
        if status == S.PENDING_COUNCIL and report_status == "under_review":
            side = "audit"
        if side is None or entered is None:
            continue
        ages[side].append((today - timezone.localtime(entered).date()).days)
    return {
        side: {
            "count": len(ages.get(side, [])),
            "average_days": round(mean(ages[side]), 1) if ages.get(side) else 0.0,
            "max_days": max(ages[side]) if ages.get(side) else 0,
        }
        for side in ("department", "audit", "council")
    }


def _aging(annotated, today):
    from apps.workflow.presentation import overdue_q

    buckets = {f"{low}-{high}" if high else f"{low}+": 0 for low, high in AGING_BUCKETS}
    for deadline in annotated.filter(overdue_q(today)).values_list("binding_deadline", flat=True):
        days = (today - deadline).days
        for low, high in AGING_BUCKETS:
            if days >= low and (high is None or days <= high):
                buckets[f"{low}-{high}" if high else f"{low}+"] += 1
                break
    return buckets


def _implementation(operational):
    """Average per-case plan progress over open cases in execution."""
    from apps.workflow.models import ActionStep

    per_case = (
        ActionStep.objects.filter(plan__recommendation=OuterRef("pk"))
        .values("plan")
        .annotate(average=Avg("progress_percent"))
        .values("average")[:1]
    )
    executing = operational.filter(status__in=IN_EXECUTION_STATUSES, action_plan__steps__isnull=False).distinct()
    progress = (
        operational.filter(pk__in=executing.values("pk"))
        .annotate(case_progress=Subquery(per_case))
        .aggregate(average=Avg("case_progress"), cases=Count("id"))
    )
    steps = operational.filter(status__in=IN_EXECUTION_STATUSES).aggregate(
        steps_total=Count("action_plan__steps"),
        steps_done=Count("action_plan__steps", filter=Q(action_plan__steps__is_done=True)),
    )
    steps_total = steps["steps_total"] or 0
    return {
        "average_step_progress": round(float(progress["average"] or 0), 1),
        "cases_in_execution": progress["cases"] or 0,
        "steps_total": steps_total,
        "steps_done": steps["steps_done"] or 0,
        "steps_completion_rate": _rate(steps["steps_done"] or 0, steps_total),
    }


def _decisions(operational, months):
    """Council closure decisions per month and the reopen rate."""
    from apps.core.models import AuditTrail

    first = timezone.localdate().replace(day=1)
    month, year = first.month - (months - 1), first.year
    while month <= 0:
        month += 12
        year -= 1
    cutoff = first.replace(year=year, month=month)
    trail = AuditTrail.objects.filter(
        recommendation__in=operational.values("pk"),
        action__in=("council_closed_recommendation", "council_reopened_recommendation", "council_ratification"),
    )
    counts = dict(trail.values_list("action").annotate(count=Count("id")))
    closed = counts.get("council_closed_recommendation", 0)
    reopened = counts.get("council_reopened_recommendation", 0)
    per_month = defaultdict(lambda: {"closed": 0, "reopened": 0, "ratified": 0})
    for row in (
        trail.filter(created_at__date__gte=cutoff)
        .annotate(month=TruncMonth("created_at"))
        .values("month", "action")
        .annotate(count=Count("id"))
    ):
        key = row["month"].date().isoformat() if hasattr(row["month"], "date") else str(row["month"])
        name = {
            "council_closed_recommendation": "closed",
            "council_reopened_recommendation": "reopened",
            "council_ratification": "ratified",
        }[row["action"]]
        per_month[key][name] += row["count"]
    return {
        "closure_decisions": closed + reopened,
        "closed": closed,
        "reopened": reopened,
        "reopen_rate": _rate(reopened, closed + reopened),
        "ratified": counts.get("council_ratification", 0),
        "per_month": [{"month": key, **value} for key, value in sorted(per_month.items())],
    }


def build_analytics(queryset, *, months=12):
    """One analytics payload from a handful of aggregate queries."""
    from apps.workflow.presentation import STATUS_STAGE, annotate_workflow, overdue_q

    today = timezone.localdate()
    drafts = queryset.filter(status=S.DRAFT).count()
    operational = queryset.exclude(status=S.DRAFT)
    annotated = annotate_workflow(operational)

    totals = portfolio_totals(operational, today)
    totals["drafts"] = drafts
    totals["all_records"] = totals["total"] + drafts

    by_status = _counts_by(operational, "status")
    by_stage = defaultdict(int)
    for status, count in by_status.items():
        by_stage[STATUS_STAGE.get(status, "preparation")] += count

    # Department performance: one grouped query, not one query per department.
    open_q = ~Q(status=S.CLOSED)
    departments = []
    for row in annotated.values("report__department_id", "report__department__name").annotate(
        total=Count("id"),
        open=Count("id", filter=open_q),
        closed=Count("id", filter=Q(status=S.CLOSED)),
        closed_implemented=Count("id", filter=Q(status=S.CLOSED, resolution=R.IMPLEMENTED)),
        overdue=Count("id", filter=overdue_q(today)),
        overdue_base=Count(
            "id", filter=Q(status__in=DEPARTMENT_DEADLINE_STATUSES, binding_deadline__isnull=False)
        ),
        in_progress=Count("id", filter=Q(status__in=IN_EXECUTION_STATUSES)),
        high_risk=Count("id", filter=open_q & Q(risk_level=Recommendation.RiskLevel.HIGH)),
        recurring=Count("id", filter=Q(is_recurring=True, recurrence_confirmed=True)),
        implementing=Count(
            "id",
            filter=Q(status__in=FROM_PLAN_STAGE_STATUSES) | Q(status=S.CLOSED, resolution=R.IMPLEMENTED),
        ),
    ):
        departments.append({
            "department": row["report__department_id"],
            "name": row["report__department__name"],
            "total": row["total"],
            "open": row["open"],
            "closed": row["closed"],
            "closed_implemented": row["closed_implemented"],
            "overdue": row["overdue"],
            "overdue_rate": _rate(row["overdue"], row["overdue_base"]),
            "in_progress": row["in_progress"],
            "high_risk": row["high_risk"],
            "recurring": row["recurring"],
            "execution_rate": _rate(row["closed_implemented"], row["implementing"]),
        })
    departments.sort(key=lambda row: (-row["overdue"], -row["open"], row["name"] or ""))

    return {
        "generated_at": timezone.now().isoformat(),
        "definitions_version": 2,
        "totals": totals,
        "by_status": by_status,
        "by_stage": dict(by_stage),
        "by_risk": _counts_by(operational.filter(open_q), "risk_level"),
        "by_engagement_type": _counts_by(operational, "report__engagement_type"),
        "by_department": departments,
        "volume": _monthly_series(operational, months),
        "implementation": _implementation(operational),
        "queues": _queues(annotated, today),
        "overdue_aging": _aging(annotated, today),
        "decisions": _decisions(operational, months),
        "recurrence": {
            "confirmed": totals["recurring_confirmed"],
            "awaiting_confirmation": totals["recurring_flagged"],
        },
    }
