"""Execution: step progress, evidence, self-assessment and head review."""
import logging

from django.db import transaction as db_transaction

from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.core.exceptions import StorageUnavailable, WorkflowError
from apps.core.files import bind_stored_name
from apps.core.models import log_action
from apps.core.uploads import claim_uploaded_file
from apps.notifications.models import Notification

from ..models import (
    ActionStep,
    ApprovalRecord,
    Evidence,
)
from ..transitions import transition
from .notify import (
    _assignee,
    _audit_users,
    _department_heads,
    _notify,
    _rec_ref,
)

S = Recommendation.Status
logger = logging.getLogger("apps.workflow.services")


EXECUTION_STATUSES = (S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)


def _ensure_executor(recommendation, user):
    plan = getattr(recommendation, "action_plan", None)
    if plan is None:
        raise WorkflowError("No approved action plan exists for this recommendation.")
    if user.role == User.Role.EMPLOYEE and plan.responsible_employee_id != user.id:
        raise WorkflowError("Only the responsible employee may update this recommendation.")
    if user.role == User.Role.DEPARTMENT_HEAD and user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only act within your own department.")
    if user.role not in (User.Role.EMPLOYEE, User.Role.DEPARTMENT_HEAD):
        raise WorkflowError("Only the responsible employee or department head may do this.")
    return plan


def _resume_if_returned(recommendation, user):
    """Working on a returned/partial/reopened item moves it back to in_progress."""
    if recommendation.status in (S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED):
        transition(recommendation, S.IN_PROGRESS, user, "execution_resumed", system=True)


@db_transaction.atomic
def update_step_progress(recommendation, step, user, progress_percent=None, is_done=None,
                         comments=None):
    if recommendation.status not in EXECUTION_STATUSES:
        raise WorkflowError("Step progress can only be updated during execution.")
    plan = _ensure_executor(recommendation, user)
    if step.plan_id != plan.id:
        raise WorkflowError("This step does not belong to the recommendation's plan.")
    if step.depends_on_id and is_done:
        dep = ActionStep.objects.get(pk=step.depends_on_id)
        if not dep.is_done:
            raise WorkflowError(
                f"Step '{step.title}' depends on '{dep.title}', which is not completed yet."
            )

    previous = {
        "progress_percent": step.progress_percent,
        "is_done": step.is_done,
        "comments": step.comments,
    }
    if progress_percent is not None:
        if not 0 <= progress_percent <= 100:
            raise WorkflowError("Progress must be between 0 and 100.")
        step.progress_percent = progress_percent
    if is_done is not None:
        step.is_done = is_done
        if is_done:
            step.progress_percent = 100
    if comments is not None:
        step.comments = comments
    step.save()

    _resume_if_returned(recommendation, user)
    log_action(
        user, "step_progress_updated", recommendation=recommendation,
        report=recommendation.report, step_id=step.id, step_title=step.title,
        previous=previous,
        current={"progress_percent": step.progress_percent, "is_done": step.is_done},
    )
    return step


@db_transaction.atomic
def add_evidence(recommendation, user, file=None, step=None, notes="", stored_name=""):
    if recommendation.status not in EXECUTION_STATUSES + (S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION):
        raise WorkflowError("Evidence can only be uploaded during execution or verification.")
    _ensure_executor(recommendation, user)
    if step is not None and step.plan.recommendation_id != recommendation.id:
        raise WorkflowError("The linked step does not belong to this recommendation.")
    if file is None and not stored_name:
        raise WorkflowError("A file is required.")

    if stored_name:
        # Same rule as management-response attachments: the key is verified
        # against the storage provider before it is attached to a case.
        stored_name = claim_uploaded_file(stored_name, purpose="evidence", user=user)

    try:
        evidence = Evidence(
            recommendation=recommendation, step=step, uploaded_by=user, notes=notes
        )
        if stored_name:
            bind_stored_name(evidence, "file", stored_name)
        else:
            evidence.file = file
        evidence.save()
    except OSError as exc:
        raise StorageUnavailable(
            "Could not store the uploaded file. File storage is unavailable."
        ) from exc
    _resume_if_returned(recommendation, user)
    log_action(
        user, "evidence_uploaded", recommendation=recommendation,
        report=recommendation.report, evidence_id=evidence.id,
        file_name=evidence.file.name, step_id=step.id if step else None,
    )
    return evidence


@db_transaction.atomic
def delete_evidence(recommendation, user, evidence):
    """Remove an uploaded evidence file during implementation.

    Same actors as upload: the responsible employee (own files only) or the
    department head. Not allowed after the case leaves implementation/verification.
    """
    if evidence.recommendation_id != recommendation.id:
        raise WorkflowError("This evidence does not belong to this recommendation.")
    if recommendation.status not in EXECUTION_STATUSES + (
        S.PENDING_HEAD_REVIEW,
        S.SUBMITTED_FOR_VERIFICATION,
    ):
        raise WorkflowError("Evidence can only be removed during implementation.")
    _ensure_executor(recommendation, user)
    if user.role == User.Role.EMPLOYEE and evidence.uploaded_by_id != user.id:
        raise WorkflowError("You can only remove evidence files that you uploaded.")

    file_name = evidence.file.name if evidence.file else ""
    evidence_id = evidence.id
    step_id = evidence.step_id
    if file_name:
        try:
            evidence.file.delete(save=False)
        except Exception:
            logger.warning(
                "evidence_storage_delete_failed name=%s", file_name, exc_info=True
            )
    evidence.delete()
    log_action(
        user, "evidence_deleted", recommendation=recommendation,
        report=recommendation.report, evidence_id=evidence_id,
        file_name=file_name, step_id=step_id,
    )


@db_transaction.atomic
def mark_implemented(recommendation, user):
    """Employee self-assessment. NEVER closes the recommendation and NEVER
    skips the department head: it only submits implementation for the head
    to review, and only when required steps are done and evidence exists."""
    if recommendation.status not in (
        S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED
    ):
        raise WorkflowError("Only recommendations under execution can be marked implemented.")
    _ensure_executor(recommendation, user)

    plan = recommendation.action_plan
    incomplete = plan.steps.filter(is_required_for_closure=True, is_done=False)
    if incomplete.exists():
        titles = ", ".join(incomplete.values_list("title", flat=True)[:5])
        raise WorkflowError(f"Required steps are not completed yet: {titles}")
    if not recommendation.evidence_files.exists():
        raise WorkflowError("At least one evidence file is required before submission.")

    transition(
        recommendation, S.PENDING_HEAD_REVIEW, user, "marked_implemented"
    )
    _notify(
        _department_heads(recommendation.report.department),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"تنفيذ {_rec_ref(recommendation)} بانتظار مراجعة رئيس الدائرة قبل إرساله للرقابة الداخلية.",
    )
    return recommendation


@db_transaction.atomic
def review_implementation(recommendation, user, accept, notes=""):
    """Department head reviews execution and evidence, then either returns it
    to the employee or submits it to internal audit."""
    if recommendation.status != S.PENDING_HEAD_REVIEW:
        raise WorkflowError("This recommendation is not awaiting department review of implementation.")
    if user.role != User.Role.DEPARTMENT_HEAD:
        raise WorkflowError("Only the department head may review implementation.")
    if user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only review implementation in your own department.")

    if accept:
        ApprovalRecord.objects.create(
            recommendation=recommendation,
            approval_type=ApprovalRecord.ApprovalType.HEAD_IMPLEMENTATION_REVIEW,
            approved_by=user,
            notes=notes,
        )
        transition(
            recommendation, S.SUBMITTED_FOR_VERIFICATION, user,
            "implementation_submitted_to_audit", notes=notes,
        )
        _notify(
            _audit_users(recommendation.report.municipality),
            recommendation,
            Notification.Type.ACTION_REQUIRED,
            f"توصية بانتظار تحقق التدقيق الداخلي من الأدلة — {_rec_ref(recommendation)}.",
        )
        assignee = _assignee(recommendation)
        if assignee:
            _notify(
                [assignee],
                recommendation,
                Notification.Type.STATUS_CHANGE,
                f"رُفع تنفيذ {_rec_ref(recommendation)} إلى التدقيق الداخلي للتحقق.",
            )
    else:
        if not notes.strip():
            raise WorkflowError("Returning implementation to the employee requires notes.")
        transition(
            recommendation, S.IN_PROGRESS, user,
            "implementation_returned_by_head", notes=notes,
        )
        _notify(
            [_assignee(recommendation)],
            recommendation,
            Notification.Type.RETURNED,
            f"أعادت الإدارة التنفيذ للمزيد من العمل على {_rec_ref(recommendation)}: {notes}",
        )
    return recommendation
