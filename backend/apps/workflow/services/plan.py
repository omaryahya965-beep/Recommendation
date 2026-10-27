"""Action plans: submission by the department head and audit review."""
from datetime import timedelta

from django.utils import timezone


from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import log_action
from apps.notifications.models import Notification

from ..models import ActionPlan, ActionStep
from .. import guards
from ..transitions import transition
from .common import locked_transition
from .notify import (
    msg,
    _audit_users,
    _heads_of,
    _notify,
    _rec_ref,
)

S = Recommendation.Status


# A plan longer than this is not a plan for one recommendation.
MAX_PLAN_YEARS = 5


def _check_target_date(target_date):
    """Same rule as the deadline audit sets after a partial verification:
    never in the past (a past date made the case instantly 'overdue')."""
    today = timezone.localdate()
    if target_date < today:
        raise WorkflowError("The target date cannot be in the past.", code="target_date_in_past")
    if target_date > today + timedelta(days=365 * MAX_PLAN_YEARS):
        raise WorkflowError("The target date is too far in the future.", code="target_date_too_far")


def _upsert_plan(recommendation, user, plan_data):
    """Create or update the plan and its steps; history goes to AuditTrail."""
    employee = plan_data["responsible_employee"]
    if employee.department_id != recommendation.report.department_id:
        raise WorkflowError(
            "The responsible employee must belong to the audited department.",
            code="employee_wrong_department",
        )
    if employee.role != User.Role.EMPLOYEE:
        raise WorkflowError(
            "The responsible person must have the employee role.",
            code="employee_wrong_role",
        )

    _check_target_date(plan_data["target_date"])

    plan = getattr(recommendation, "action_plan", None)
    previous = None
    if plan is None:
        plan = ActionPlan(recommendation=recommendation, submitted_by=user)
    else:
        previous = {
            "responsible_employee": plan.responsible_employee_id,
            "target_date": str(plan.target_date),
            "notes": plan.notes,
            "steps": list(plan.steps.values("title", "order", "is_done")),
        }
        plan.revision_count += 1
        plan.submitted_by = user
    plan.responsible_employee = employee
    plan.target_date = plan_data["target_date"]
    plan.notes = plan_data.get("notes", "")
    plan.status = ActionPlan.Status.SUBMITTED
    plan.save()

    steps = plan_data.get("steps")
    if steps is not None:
        plan.steps.all().delete()
        created = {}
        for idx, step in enumerate(steps):
            obj = ActionStep.objects.create(
                plan=plan,
                title=step["title"],
                order=step.get("order", idx),
                comments=step.get("comments", ""),
            )
            created[idx] = obj
        for idx, step in enumerate(steps):
            dep = step.get("depends_on_index")
            if dep is not None and dep in created and dep != idx:
                created[idx].depends_on = created[dep]
                created[idx].save(update_fields=["depends_on"])

    log_action(
        user, "action_plan_submitted", recommendation=recommendation,
        report=recommendation.report, previous_plan=previous,
        target_date=str(plan.target_date), responsible_employee=employee.username,
    )
    return plan


@locked_transition
def submit_action_plan(recommendation, user, plan_data):
    guards.require("submit_plan", recommendation, user)

    plan = _upsert_plan(recommendation, user, plan_data)
    transition(recommendation, S.ACTION_PLAN_REVIEW, user, "action_plan_submitted_for_review")
    _notify(
        _audit_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        msg("plan_submitted", f"خطة عمل جديدة بانتظار مراجعة التدقيق الداخلي — {_rec_ref(recommendation)}.", ref=_rec_ref(recommendation)),
    )
    return plan


@locked_transition
def review_action_plan(recommendation, user, approve, notes=""):
    guards.require("review_plan", recommendation, user)
    plan = recommendation.action_plan

    plan.reviewed_by = user
    plan.review_notes = notes

    if approve:
        plan.status = ActionPlan.Status.APPROVED
        plan.save()
        transition(recommendation, S.ACTION_PLAN_APPROVED, user, "action_plan_approved", notes=notes)
        transition(recommendation, S.IN_PROGRESS, user, "execution_started", system=True)
        _notify(
            [plan.responsible_employee],
            recommendation,
            Notification.Type.ACTION_REQUIRED,
            msg("plan_approved_assignee", f"اعتُمدت خطة العمل وبدأ التنفيذ للتوصية المسندة إليك — {_rec_ref(recommendation)}.", ref=_rec_ref(recommendation)),
        )
        _notify(
            _heads_of(recommendation),
            recommendation,
            Notification.Type.STATUS_CHANGE,
            msg("plan_approved", f"اعتُمدت خطة العمل لـ {_rec_ref(recommendation)} وبدأ التنفيذ.", ref=_rec_ref(recommendation)),
        )
    else:
        if not notes.strip():
            raise WorkflowError(
                "Requesting a plan revision requires review notes.",
                code="review_notes_required",
            )
        plan.status = ActionPlan.Status.REVISION_REQUIRED
        plan.save()
        transition(recommendation, S.REVISION_REQUIRED, user, "action_plan_revision_requested", notes=notes)
        recipients = list(_heads_of(recommendation))
        if plan.responsible_employee_id:
            recipients.append(plan.responsible_employee)
        _notify(
            recipients,
            recommendation,
            Notification.Type.RETURNED,
            msg("plan_revision", f"مطلوب تعديل خطة العمل لـ {_rec_ref(recommendation)}: {notes}", ref=_rec_ref(recommendation), notes=notes),
        )
    return plan
