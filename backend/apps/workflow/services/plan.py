"""Action plans: submission by the department head and audit review."""
from django.db import transaction as db_transaction

from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import log_action
from apps.notifications.models import Notification

from ..models import ActionPlan, ActionStep
from ..transitions import transition
from .notify import (
    _audit_users,
    _heads_of,
    _notify,
    _rec_ref,
)

S = Recommendation.Status


def _upsert_plan(recommendation, user, plan_data):
    """Create or update the plan and its steps; history goes to AuditTrail."""
    employee = plan_data["responsible_employee"]
    if employee.department_id != recommendation.report.department_id:
        raise WorkflowError("The responsible employee must belong to the audited department.")
    if employee.role != User.Role.EMPLOYEE:
        raise WorkflowError("The responsible person must have the employee role.")

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


@db_transaction.atomic
def submit_action_plan(recommendation, user, plan_data):
    if recommendation.status not in (S.ACTION_PLAN_REQUIRED, S.REVISION_REQUIRED):
        raise WorkflowError("This recommendation is not awaiting an action plan.")
    if user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only submit plans for your own department.")

    plan = _upsert_plan(recommendation, user, plan_data)
    transition(recommendation, S.ACTION_PLAN_REVIEW, user, "action_plan_submitted_for_review")
    _notify(
        _audit_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"خطة عمل جديدة بانتظار مراجعة التدقيق الداخلي — {_rec_ref(recommendation)}.",
    )
    return plan


@db_transaction.atomic
def review_action_plan(recommendation, user, approve, notes=""):
    if recommendation.status != S.ACTION_PLAN_REVIEW:
        raise WorkflowError("This recommendation's action plan is not under review.")
    plan = getattr(recommendation, "action_plan", None)
    if plan is None:
        raise WorkflowError("No action plan exists to review.")

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
            f"اعتُمدت خطة العمل وبدأ التنفيذ للتوصية المسندة إليك — {_rec_ref(recommendation)}.",
        )
        _notify(
            _heads_of(recommendation),
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"اعتُمدت خطة العمل لـ {_rec_ref(recommendation)} وبدأ التنفيذ.",
        )
    else:
        if not notes.strip():
            raise WorkflowError("Requesting a plan revision requires review notes.")
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
            f"مطلوب تعديل خطة العمل لـ {_rec_ref(recommendation)}: {notes}",
        )
    return plan
