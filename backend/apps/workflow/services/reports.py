"""Report-level actions: issue to the department, submit to and ratify by the council."""
from django.db import transaction as db_transaction
from django.utils import timezone

from apps.audits.models import AuditReport, Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import log_action
from apps.notifications.models import Notification

from ..models import (
    ActionPlan,
    ApprovalRecord,
    ManagementResponse,
)
from ..transitions import transition
from .common import _policy
from .notify import (
    _audit_users,
    _council_users,
    _department_heads,
    _notify,
    _rec_ref,
)

S = Recommendation.Status


@db_transaction.atomic
def submit_report_to_department(report, user):
    report.refresh_from_db()
    if report.status != AuditReport.Status.DRAFT:
        raise WorkflowError("Only draft reports can be sent to the department.", code="report_not_draft")
    recommendations = list(report.recommendations.all())
    if not recommendations:
        raise WorkflowError("The report has no recommendations to send.", code="report_empty")

    for rec in recommendations:
        if rec.status == S.DRAFT:
            transition(rec, S.PENDING_RESPONSE, user, "report_submitted_to_department")
            _notify(
                _department_heads(report.department),
                rec,
                Notification.Type.RESPONSE_NEEDED,
                f"توصية جديدة بانتظار رد الإدارة — {_rec_ref(rec)} في التقرير: {report.title}",
            )

    report.status = AuditReport.Status.PENDING_RESPONSE
    report.save(update_fields=["status", "updated_at"])
    log_action(user, "report_submitted_to_department", report=report)
    return report


@db_transaction.atomic
def submit_report_to_council(report, user):
    report.refresh_from_db()
    if report.status != AuditReport.Status.UNDER_REVIEW:
        raise WorkflowError(
            "The report must be under audit review before council submission.",
            code="report_not_under_review",
        )
    pending = report.recommendations.exclude(status=S.PENDING_COUNCIL).count()
    if pending:
        raise WorkflowError(
            f"{pending} recommendation(s) are not yet audit-approved for council submission.",
            code="report_has_unapproved",
            params={"count": pending},
        )
    report.status = AuditReport.Status.PENDING_COUNCIL
    report.save(update_fields=["status", "updated_at"])
    log_action(user, "report_submitted_to_council", report=report)
    for rec in report.recommendations.all():
        _notify(
            _council_users(report.municipality),
            rec,
            Notification.Type.ACTION_REQUIRED,
            f"توصية بانتظار مصادقة المجلس — {_rec_ref(rec)} في التقرير: {report.title}",
        )
    return report


@db_transaction.atomic
def ratify_report(report, user, notes=""):
    """COUNCIL_RATIFICATION: the only event that sets the reminder anchor date."""
    report.refresh_from_db()
    if report.status != AuditReport.Status.PENDING_COUNCIL:
        raise WorkflowError(
            "Only reports pending council ratification can be ratified.",
            code="report_not_pending_council",
        )

    now = timezone.now()
    policy = _policy(report)
    require_plan_with_response = bool(policy and policy.require_plan_with_response)

    for rec in report.recommendations.select_related("response").all():
        ApprovalRecord.objects.create(
            recommendation=rec,
            approval_type=ApprovalRecord.ApprovalType.COUNCIL_RATIFICATION,
            approved_by=user,
            notes=notes,
        )
        response = getattr(rec, "response", None)
        if response and response.decision == ManagementResponse.Decision.DISAGREE:
            rec.resolution = Recommendation.Resolution.DISAGREEMENT_ACCEPTED
            rec.save(update_fields=["resolution", "updated_at"])
            transition(rec, S.CLOSED, user, "council_ratified_disagreement")
            _notify(
                list(_department_heads(report.department)) + list(_audit_users(report.municipality)),
                rec,
                Notification.Type.STATUS_CHANGE,
                f"أغلق المجلس التوصية {_rec_ref(rec)} بعد قبول عدم الاتفاق.",
            )
            continue

        transition(rec, S.APPROVED_FOR_IMPLEMENTATION, user, "council_ratification")
        plan = getattr(rec, "action_plan", None)
        if require_plan_with_response and plan and plan.status == ActionPlan.Status.APPROVED:
            transition(rec, S.ACTION_PLAN_APPROVED, user, "plan_pre_approved_with_response", system=True)
            transition(rec, S.IN_PROGRESS, user, "execution_started", system=True)
            _notify(
                [plan.responsible_employee],
                rec,
                Notification.Type.ACTION_REQUIRED,
                f"بدأ تنفيذ التوصية المسندة إليك — {_rec_ref(rec)}.",
            )
            _notify(
                _department_heads(report.department),
                rec,
                Notification.Type.STATUS_CHANGE,
                f"صادق المجلس على {_rec_ref(rec)} وبدأ التنفيذ.",
            )
        else:
            transition(rec, S.ACTION_PLAN_REQUIRED, user, "action_plan_requested", system=True)
            _notify(
                _department_heads(report.department),
                rec,
                Notification.Type.ACTION_REQUIRED,
                f"صادق المجلس على {_rec_ref(rec)} — المطلوب تقديم خطة العمل.",
            )

    report.status = AuditReport.Status.RATIFIED
    report.council_approval_date = now
    report.save(update_fields=["status", "council_approval_date", "updated_at"])
    log_action(user, "report_ratified_by_council", report=report, notes=notes)
    return report
