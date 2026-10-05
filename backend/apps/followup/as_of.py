"""Where every recommendation stood at a moment in the past.

A follow-up report for March must describe the register on 31 March, not
today. Nothing here reads a recommendation's current status for that: the
append-only AuditTrail records every status change (`metadata.to_status`),
so the status at any moment is the last transition at or before it. The
action-plan target date in force at that moment comes from the
`action_plan_submitted` entries, and the verification deadline (W1) from the
verification decisions recorded by then.

Everything is computed with correlated subqueries in one query; the existing
(recommendation, created_at) index on AuditTrail serves them.

Rows without any status history (data created outside the workflow
services) fall back to their current state and are flagged
`history_incomplete`, so a report never silently mixes the two.
"""
from __future__ import annotations

from datetime import date, datetime, time

from django.db.models import Exists, OuterRef, Subquery
from django.db.models.fields.json import KT
from django.utils import timezone

from apps.audits.models import (
    AUDIT_QUEUE_STATUSES,
    COUNCIL_QUEUE_STATUSES,
    DEPARTMENT_DEADLINE_STATUSES,
    RETURNED_WORK_DECISIONS,
    Recommendation,
)
from apps.core.models import AuditTrail
from apps.workflow.models import VerificationDecision

S = Recommendation.Status
RESPONSE_STATUSES = (S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION)


def period_bounds(period_start: date, period_end: date, now: datetime | None = None):
    """(start of the first day, end of the last day) in local time. The end
    is clamped to now: a period that has not finished is reported as of now."""
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(period_start, time.min), tz)
    end = timezone.make_aware(datetime.combine(period_end, time.max), tz)
    return start, min(end, now or timezone.now())


def _status_at(moment, inclusive: bool):
    trail = AuditTrail.objects.filter(
        recommendation=OuterRef("pk"), metadata__has_key="to_status"
    )
    trail = trail.filter(created_at__lte=moment) if inclusive else trail.filter(created_at__lt=moment)
    return Subquery(
        trail.order_by("-created_at", "-id")
        .annotate(_to_status=KT("metadata__to_status"))
        .values("_to_status")[:1]
    )


def annotate_as_of(queryset, period_start_at, as_of):
    """Adds the state at the start and at the end of the period to each row."""
    issued = (
        AuditTrail.objects.filter(recommendation=OuterRef("pk"))
        .annotate(_to_status=KT("metadata__to_status"))
        .filter(_to_status=S.PENDING_RESPONSE)
        .order_by("created_at", "id")
    )
    history = AuditTrail.objects.filter(recommendation=OuterRef("pk"), metadata__has_key="to_status")
    plan_target = (
        AuditTrail.objects.filter(
            recommendation=OuterRef("pk"), action="action_plan_submitted", created_at__lte=as_of
        )
        .order_by("-created_at", "-id")
        .annotate(_target=KT("metadata__target_date"))
        .values("_target")[:1]
    )
    verification = VerificationDecision.objects.filter(
        recommendation=OuterRef("pk"), created_at__lte=as_of
    ).order_by("-created_at", "-id")
    return queryset.annotate(
        status_at_end=_status_at(as_of, inclusive=True),
        status_at_start=_status_at(period_start_at, inclusive=False),
        issued_at=Subquery(issued.values("created_at")[:1]),
        has_history=Exists(history),
        plan_target_at_end=Subquery(plan_target),
        verification_decision_at_end=Subquery(verification.values("decision")[:1]),
        verification_deadline_at_end=Subquery(verification.values("action_deadline")[:1]),
    )


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _plan(rec):
    try:
        return rec.action_plan
    except Recommendation.action_plan.RelatedObjectDoesNotExist:
        return None


def case_as_of(rec, period_start_at, as_of):
    """The case as it stood at `as_of`, or None if it was not on the register
    during the period (not issued yet, or closed before the period began)."""
    as_of_date = timezone.localtime(as_of).date()
    period_start_date = timezone.localtime(period_start_at).date()
    legacy = not rec.has_history
    plan = _plan(rec)

    if legacy:
        if rec.status == S.DRAFT or rec.created_at > as_of:
            return None
        status_end = rec.status
        status_start = rec.status if rec.created_at < period_start_at else None
        issued_at = rec.created_at
    else:
        if rec.issued_at is None or rec.issued_at > as_of:
            return None
        status_end = rec.status_at_end or S.DRAFT
        status_start = rec.status_at_start
        issued_at = rec.issued_at
    if status_end == S.DRAFT:
        return None

    closed_at = rec.closed_at if rec.closed_at and rec.closed_at <= as_of else None
    if status_end == S.CLOSED and closed_at is None and legacy:
        closed_at = rec.closed_at or rec.updated_at
    if closed_at is not None and closed_at < period_start_at:
        return None  # closed before the period opened

    # The deadline the department was held to at that moment (W1), counted
    # only while the department owned the next action (W2).
    plan_target = _parse_date(rec.plan_target_at_end)
    if plan_target is None and legacy and plan is not None:
        plan_target = plan.target_date
    deadline, source = None, None
    if status_end in DEPARTMENT_DEADLINE_STATUSES:
        if rec.verification_decision_at_end in RETURNED_WORK_DECISIONS and rec.verification_deadline_at_end:
            deadline, source = rec.verification_deadline_at_end, "verification"
        elif plan_target is not None:
            deadline, source = plan_target, "plan"
    elif status_end in RESPONSE_STATUSES and rec.report.response_deadline:
        deadline, source = rec.report.response_deadline, "response"

    department_owned = status_end in DEPARTMENT_DEADLINE_STATUSES
    overdue = bool(department_owned and deadline and deadline < as_of_date)
    in_review = status_end in AUDIT_QUEUE_STATUSES or status_end in COUNCIL_QUEUE_STATUSES
    return {
        "status": status_end,
        "status_at_start": status_start,
        "open_at_start": bool(status_start) and status_start not in (S.CLOSED, S.DRAFT),
        "issued_at": issued_at,
        "issued_in_period": issued_at >= period_start_at,
        "closed_at": closed_at,
        "closed_in_period": closed_at is not None and closed_at >= period_start_at,
        "resolution": rec.resolution if status_end == S.CLOSED else "",
        "plan_target": plan_target,
        "deadline": deadline,
        "deadline_source": source,
        "overdue": overdue,
        "days_overdue": (as_of_date - deadline).days if overdue else 0,
        "became_overdue": bool(overdue and deadline >= period_start_date),
        "response_overdue": bool(status_end in RESPONSE_STATUSES and deadline and deadline < as_of_date),
        # Waiting on audit/council past the plan date: shown separately,
        # never counted as department delay (W2).
        "late_in_review": bool(in_review and plan_target and plan_target < as_of_date),
        "history_incomplete": legacy,
    }
