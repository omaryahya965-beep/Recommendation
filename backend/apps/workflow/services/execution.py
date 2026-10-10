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

from .. import guards
from ..models import ActionStep, ApprovalRecord, Evidence
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

# Kept for importers; the rule itself lives in guards.
EXECUTION_STATUSES = guards.EXECUTION_STATUSES


def _ensure_executor(recommendation, user):
    """The plan, if `user` is the responsible employee or the head of the
    audited department; otherwise the matching WorkflowError."""
    blocker = guards.executor(recommendation, user)
    if blocker is not None:
        raise WorkflowError(
            guards.BLOCKER_TEXT.get(blocker.code, blocker.code), code=blocker.code
        )
    return recommendation.action_plan


def _resume_if_returned(recommendation, user):
    """Working on a returned/partial/reopened item moves it back to in_progress."""
    if recommendation.status in (S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED):
        transition(recommendation, S.IN_PROGRESS, user, "execution_resumed", system=True)


@db_transaction.atomic
def update_step_progress(recommendation, step, user, progress_percent=None, is_done=None,
                         comments=None):
    guards.require("update_progress", recommendation, user)
    plan = recommendation.action_plan
    if step.plan_id != plan.id:
        raise WorkflowError(
            "This step does not belong to the recommendation's plan.", code="step_wrong_plan"
        )
    if step.depends_on_id and is_done:
        dep = ActionStep.objects.get(pk=step.depends_on_id)
        if not dep.is_done:
            raise WorkflowError(
                f"Step '{step.title}' depends on '{dep.title}', which is not completed yet.",
                code="step_dependency_incomplete",
                params={"step": step.title, "dependency": dep.title},
            )

    previous = {
        "progress_percent": step.progress_percent,
        "is_done": step.is_done,
        "comments": step.comments,
    }
    if progress_percent is not None:
        if not 0 <= progress_percent <= 100:
            raise WorkflowError(
                "Progress must be between 0 and 100.", code="progress_out_of_range"
            )
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
    guards.require("upload_evidence", recommendation, user)
    if step is not None and step.plan.recommendation_id != recommendation.id:
        raise WorkflowError(
            "The linked step does not belong to this recommendation.", code="evidence_wrong_step"
        )
    if file is None and not stored_name:
        raise WorkflowError("A file is required.", code="file_required")

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


def evidence_delete_blocker(recommendation, user, evidence):
    """Why this user may not delete this file now, or None if they may."""
    availability = guards.check("delete_evidence", recommendation, user)
    if availability is None:
        return "evidence_delete_not_allowed"
    if user.role == User.Role.EMPLOYEE and evidence.uploaded_by_id != user.id:
        return "evidence_not_owner"
    return None


@db_transaction.atomic
def delete_evidence(recommendation, user, evidence):
    """Remove an uploaded evidence file during implementation.

    Same actors as upload: the responsible employee (own files only) or the
    department head. Not allowed after the case leaves implementation/verification.
    """
    if evidence.recommendation_id != recommendation.id:
        raise WorkflowError(
            "This evidence does not belong to this recommendation.", code="evidence_wrong_case"
        )
    guards.require("delete_evidence", recommendation, user)
    if user.role == User.Role.EMPLOYEE and evidence.uploaded_by_id != user.id:
        raise WorkflowError(
            "You can only remove evidence files that you uploaded.", code="evidence_not_owner"
        )

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
    guards.require("mark_implemented", recommendation, user)

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
    guards.require("review_implementation", recommendation, user)

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
            raise WorkflowError(
                "Returning implementation to the employee requires notes.",
                code="review_notes_required",
            )
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
