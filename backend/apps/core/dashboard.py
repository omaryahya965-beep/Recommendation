"""Role dashboards (payload version 2).

Each role's home answers "what needs me now, what is late, and what is
waiting on someone else". Every block is computed in SQL from the same
definitions as the register filters (apps.workflow.presentation) and the
analytics page (apps.core.analytics), so a count on a dashboard always equals
the register list it links to.

A block is `{"count": n, "items": [...]}` with at most ITEM_LIMIT items; the
count is always exact.
"""
from datetime import timedelta

from django.db.models import Count, F, Min, Q
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.models import (
    DEPARTMENT_DEADLINE_STATUSES,
    OPEN_STATUSES,
    AuditReport,
    Recommendation,
)
from apps.audits.serializers import RecommendationListSerializer
from apps.core.analytics import IN_EXECUTION_STATUSES, portfolio_totals
from apps.core.models import AuditTrail
from apps.workflow.presentation import overdue_q, waiting_longer_than_q, waiting_on_q

S = Recommendation.Status

VERSION = 2
ITEM_LIMIT = 10
# Audit's own service level: a case in an audit queue longer than this is
# "late in our queue" (the department is never blamed for it — W2).
AUDIT_QUEUE_LATE_DAYS = 7
# A high-risk case whose status has not moved for this long is "stale".
STALE_DAYS = 30
DUE_SOON_DAYS = 7
UPCOMING_DAYS = 30
# The employee's own submitted work under review (head, audit, Council).
UNDER_REVIEW_STATUSES = (
    S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION, S.CLOSURE_REVIEW, S.PENDING_CLOSURE_COUNCIL,
)

COUNCIL_DECISION_ACTIONS = {
    "report_ratified_by_council": "ratified",
    "council_closed_recommendation": "closed",
    "council_reopened_recommendation": "reopened",
}

# Oldest first in a queue: the case that has waited longest is served first.
BY_WAIT = (F("status_entered_at").asc(), "-priority_score", "id")
BY_DEADLINE = (F("binding_deadline").asc(nulls_last=True), "-priority_score", "id")


def _block(queryset, request, order=BY_WAIT, limit=ITEM_LIMIT):
    return {
        "count": queryset.count(),
        "items": RecommendationListSerializer(
            queryset.order_by(*order)[:limit], many=True, context={"request": request}
        ).data,
    }


def _stats(queryset):
    """KPIs from the same function as /api/analytics/ (portfolio_totals)."""
    issued = queryset.exclude(status=S.DRAFT)
    return {
        **portfolio_totals(issued),
        "by_status": dict(issued.values_list("status").annotate(c=Count("id"))),
        "by_risk": dict(
            issued.filter(status__in=OPEN_STATUSES).values_list("risk_level").annotate(c=Count("id"))
        ),
    }


def _report_rows(reports):
    return [
        {
            "id": report.id,
            "title": report.title,
            "department_name": report.department.name,
            "engagement_type": report.engagement_type,
            "recommendations_count": report.recommendations_total,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        }
        for report in reports[:ITEM_LIMIT]
    ]


def _reports_block(queryset):
    queryset = queryset.select_related("department")
    return {"count": queryset.count(), "items": _report_rows(queryset)}


def _envelope(role, request, issued, **blocks):
    return {
        "role": role,
        "version": VERSION,
        "generated_at": timezone.now().isoformat(),
        **blocks,
        "stats": _stats(issued),
    }


# ---------------------------------------------------------------------------
# Internal audit
# ---------------------------------------------------------------------------
def audit_dashboard(request, issued, today):
    user = request.user
    reports = AuditReport.objects.filter(municipality=user.municipality).annotate(
        recommendations_total=Count("recommendations", distinct=True),
        at_council_gate=Count(
            "recommendations", filter=Q(recommendations__status=S.PENDING_COUNCIL), distinct=True
        ),
    )
    # Every recommendation reviewed and approved for council: the report can go.
    ready_for_council = reports.filter(
        status=AuditReport.Status.UNDER_REVIEW,
        recommendations_total__gt=0,
        at_council_gate=F("recommendations_total"),
    ).order_by("updated_at", "id")
    drafts = reports.filter(status=AuditReport.Status.DRAFT).order_by("-updated_at", "-id")

    overdue = issued.filter(overdue_q(today))
    by_department = (
        issued.filter(status__in=OPEN_STATUSES)
        .values("report__department_id", "report__department__name")
        .annotate(open=Count("id"), overdue=Count("id", filter=overdue_q(today)))
        .order_by("-overdue", "-open", "report__department__name")
    )

    return _envelope(
        "audit",
        request,
        issued,
        action_center={
            "responses_to_review": _block(issued.filter(status=S.AUDIT_REVIEW), request),
            "plans_to_review": _block(issued.filter(status=S.ACTION_PLAN_REVIEW), request),
            "verifications_pending": _block(issued.filter(status=S.SUBMITTED_FOR_VERIFICATION), request),
            "closure_reviews": _block(issued.filter(status=S.CLOSURE_REVIEW), request),
            "overdue": _block(overdue, request, order=BY_DEADLINE),
            "possible_recurrences": _block(issued.filter(is_recurring=True, recurrence_confirmed=False), request),
        },
        reports_ready_for_council=_reports_block(ready_for_council),
        draft_reports=_reports_block(drafts),
        late_in_audit_queue={
            "threshold_days": AUDIT_QUEUE_LATE_DAYS,
            **_block(issued.filter(waiting_on_q("audit"), waiting_longer_than_q(AUDIT_QUEUE_LATE_DAYS, today)), request),
        },
        high_risk_stale={
            "threshold_days": STALE_DAYS,
            **_block(
                issued.filter(
                    waiting_longer_than_q(STALE_DAYS, today), status__in=OPEN_STATUSES, risk_level="high"
                ),
                request,
            ),
        },
        overdue_by_department=[
            {
                "department": {"id": row["report__department_id"], "name": row["report__department__name"]},
                "open": row["open"],
                "overdue": row["overdue"],
            }
            for row in by_department
        ],
    )


# ---------------------------------------------------------------------------
# Department head
# ---------------------------------------------------------------------------
def department_head_dashboard(request, issued, today):
    team_rows = (
        issued.filter(status__in=OPEN_STATUSES, action_plan__isnull=False)
        .values("action_plan__responsible_employee")
        .annotate(open=Count("id"), overdue=Count("id", filter=overdue_q(today)))
    )
    loads = {row["action_plan__responsible_employee"]: row for row in team_rows}
    employees = User.objects.filter(
        role=User.Role.EMPLOYEE, department=request.user.department, is_active=True
    ).order_by("full_name_ar", "username")
    team = sorted(
        (
            {
                "employee": {"id": employee.id, "name": employee.full_name_ar or employee.username},
                "open": loads.get(employee.id, {}).get("open", 0),
                "overdue": loads.get(employee.id, {}).get("overdue", 0),
            }
            for employee in employees
        ),
        key=lambda row: (-row["overdue"], -row["open"], row["employee"]["name"]),
    )
    due_soon = issued.filter(
        status__in=DEPARTMENT_DEADLINE_STATUSES,
        binding_deadline__gte=today,
        binding_deadline__lte=today + timedelta(days=DUE_SOON_DAYS),
    )

    return _envelope(
        "department_head",
        request,
        issued,
        action_center={
            "responses_needed": _block(
                issued.filter(status__in=(S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION)), request, order=BY_DEADLINE
            ),
            "plans_needed": _block(
                issued.filter(status__in=(S.APPROVED_FOR_IMPLEMENTATION, S.ACTION_PLAN_REQUIRED, S.REVISION_REQUIRED)),
                request,
            ),
            "implementations_to_review": _block(issued.filter(status=S.PENDING_HEAD_REVIEW), request),
            "overdue": _block(issued.filter(overdue_q(today)), request, order=BY_DEADLINE),
        },
        due_soon=_block(due_soon, request, order=BY_DEADLINE),
        waiting_on_others=_block(issued.filter(waiting_on_q("audit") | waiting_on_q("council")), request),
        in_execution=_block(issued.filter(status__in=IN_EXECUTION_STATUSES), request, order=BY_DEADLINE),
        team=team,
    )


# ---------------------------------------------------------------------------
# Responsible employee
# ---------------------------------------------------------------------------
def employee_dashboard(request, issued, today):
    mine = issued.filter(action_plan__responsible_employee=request.user)
    return _envelope(
        "employee",
        request,
        issued,
        action_center={
            # Returned by audit (partial / insufficient) or reopened by the Council.
            "returned_for_more_evidence": _block(
                mine.filter(status__in=(S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)), request, order=BY_DEADLINE
            ),
            "overdue": _block(mine.filter(overdue_q(today)), request, order=BY_DEADLINE),
            "upcoming_deadlines": _block(
                mine.filter(
                    status__in=DEPARTMENT_DEADLINE_STATUSES,
                    binding_deadline__gte=today,
                    binding_deadline__lte=today + timedelta(days=UPCOMING_DAYS),
                ),
                request,
                order=BY_DEADLINE,
            ),
            "waiting_head_review": _block(mine.filter(status=S.PENDING_HEAD_REVIEW), request),
        },
        active_tasks=_block(
            mine.filter(status__in=IN_EXECUTION_STATUSES + (S.ACTION_PLAN_APPROVED,)), request, order=BY_DEADLINE
        ),
        waiting_on_others=_block(mine.filter(status__in=UNDER_REVIEW_STATUSES), request),
        next_deadline=(
            mine.filter(status__in=DEPARTMENT_DEADLINE_STATUSES)
            .aggregate(next=Min("binding_deadline"))["next"]
        ),
    )


# ---------------------------------------------------------------------------
# Council
# ---------------------------------------------------------------------------
def _recent_council_decisions(user, limit=ITEM_LIMIT):
    entries = (
        AuditTrail.objects.filter(action__in=COUNCIL_DECISION_ACTIONS)
        .filter(
            Q(recommendation__report__municipality=user.municipality) | Q(report__municipality=user.municipality)
        )
        .select_related("user", "recommendation__report", "report")
        .order_by("-created_at", "-id")[:limit]
    )
    from apps.audits.finding import case_title

    decisions = []
    for entry in entries:
        rec = entry.recommendation
        report = entry.report or (rec.report if rec else None)
        decisions.append({
            "id": entry.id,
            "kind": COUNCIL_DECISION_ACTIONS[entry.action],
            "recommendation": {"id": rec.id, "title": case_title(rec.text)} if rec else None,
            "report": {"id": report.id, "title": report.title} if report else None,
            "by": entry.user.full_name_ar or entry.user.username,
            "notes": (entry.metadata or {}).get("notes", "") or "",
            "at": entry.created_at,
        })
    return decisions


def council_dashboard(request, issued, today):
    user = request.user
    pending_reports = (
        AuditReport.objects.filter(municipality=user.municipality, status=AuditReport.Status.PENDING_COUNCIL)
        .annotate(recommendations_total=Count("recommendations"))
        .order_by("updated_at", "id")
    )
    return _envelope(
        "council",
        request,
        issued,
        action_center={
            "reports_pending_ratification": _reports_block(pending_reports),
            "closures_pending": _block(issued.filter(status=S.PENDING_CLOSURE_COUNCIL), request),
        },
        reopened=_block(issued.filter(status=S.REOPENED), request, order=BY_DEADLINE),
        recent_decisions=_recent_council_decisions(user),
    )


BUILDERS = {
    User.Role.AUDIT: audit_dashboard,
    User.Role.DEPARTMENT_HEAD: department_head_dashboard,
    User.Role.EMPLOYEE: employee_dashboard,
    User.Role.COUNCIL: council_dashboard,
}


# ---------------------------------------------------------------------------
# Navigation badges
# ---------------------------------------------------------------------------
def nav_counts(user, scoped):
    """Counts only (no rows) for the navigation badges, polled on every page.

    `recommendations` is the viewer's own turn (the register's ?my_turn=true);
    the council's counts are its two decision queues; audit's `reports` is
    the reports ready to send to the Council.
    """
    from apps.workflow.presentation import my_turn_q

    role = user.role
    if role == User.Role.COUNCIL:
        return {
            "pending_approvals": AuditReport.objects.filter(
                municipality=user.municipality, status=AuditReport.Status.PENDING_COUNCIL
            ).count(),
            "closure_reviews": scoped.filter(status=S.PENDING_CLOSURE_COUNCIL).count(),
        }
    counts = {"recommendations": scoped.filter(my_turn_q(user)).count()}
    if role == User.Role.AUDIT:
        counts["reports"] = (
            AuditReport.objects.filter(municipality=user.municipality, status=AuditReport.Status.UNDER_REVIEW)
            .annotate(
                total=Count("recommendations", distinct=True),
                at_gate=Count(
                    "recommendations", filter=Q(recommendations__status=S.PENDING_COUNCIL), distinct=True
                ),
            )
            .filter(total__gt=0, at_gate=F("total"))
            .count()
        )
    return counts
