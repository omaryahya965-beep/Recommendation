"""Execution: step progress, evidence, self-assessment and head review."""
import logging


from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.core.exceptions import StorageUnavailable, WorkflowError
from apps.core.files import bind_stored_name
from apps.core.models import log_action
from apps.core.uploads import claim_uploaded_file
from apps.notifications.models import Notification

from .. import guards
from ..models import ActionStep, ApprovalRecord, Evidence, VerificationDecision
from ..transitions import transition
from .common import locked_transition
from .notify import (
    msg,
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


@locked_transition
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


@locked_transition
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


def evidence_was_assessed(evidence):
    """Internal Audit recorded a verification decision after this file was
    uploaded: that decision relied on it, so it is kept (BUG-28)."""
    return VerificationDecision.objects.filter(
        recommendation_id=evidence.recommendation_id, created_at__gte=evidence.uploaded_at
    ).exists()


def evidence_delete_blocker(recommendation, user, evidence):
    """Why this user may not delete this file now, or None if they may."""
    availability = guards.check("delete_evidence", recommendation, user)
    if availability is None:
        return "evidence_delete_not_allowed"
    if user.role == User.Role.EMPLOYEE and evidence.uploaded_by_id != user.id:
        return "evidence_not_owner"
    if evidence_was_assessed(evidence):
        return "evidence_assessed"
    return None


@locked_transition
def delete_evidence(recommendation, user, evidence):
    """Remove an uploaded evidence file during implementation.

    Same actors as upload: the responsible employee (own files only) or the
    department head. Not allowed after the case leaves implementation/verification.
    """
    if evidence.recommendation_id != recommendation.id:
        raise WorkflowError(
            "This evidence does not belong to this recommendation.", code="evidence_wrong_case"
        )
    # A concurrent request may have removed it while this one waited for the lock.
    if not Evidence.objects.filter(pk=evidence.pk).exists():
        raise WorkflowError("This evidence file was already removed.", code="evidence_already_deleted")
    guards.require("delete_evidence", recommendation, user)
    if user.role == User.Role.EMPLOYEE and evidence.uploaded_by_id != user.id:
        raise WorkflowError(
            "You can only remove evidence files that you uploaded.", code="evidence_not_owner"
        )
    if evidence_was_assessed(evidence):
        raise WorkflowError(
            "Internal Audit has already assessed this file; it is kept with the verification record.",
            code="evidence_assessed",
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


@locked_transition
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
        msg("head_review_needed", f"تنفيذ {_rec_ref(recommendation)} بانتظار مراجعة رئيس الدائرة قبل إرساله للرقابة الداخلية.", ref=_rec_ref(recommendation)),
    )
    return recommendation


@locked_transition
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
            msg("verification_needed", f"توصية بانتظار تحقق التدقيق الداخلي من الأدلة — {_rec_ref(recommendation)}.", ref=_rec_ref(recommendation)),
        )
        assignee = _assignee(recommendation)
        if assignee:
            _notify(
                [assignee],
                recommendation,
                Notification.Type.STATUS_CHANGE,
                msg("submitted_to_audit", f"رُفع تنفيذ {_rec_ref(recommendation)} إلى التدقيق الداخلي للتحقق.", ref=_rec_ref(recommendation)),
            )
    else:
        if not notes.strip():
            raise WorkflowError(
                "Returning implementation to the employee requires notes.",
                code="review_notes_required",
            )
        # Kept as a decision record so the reason reaches the employee's
        # task page (workflow.outstanding_request), not only the trail.
        ApprovalRecord.objects.create(
            recommendation=recommendation,
            approval_type=ApprovalRecord.ApprovalType.HEAD_IMPLEMENTATION_RETURN,
            approved_by=user,
            notes=notes,
        )
        transition(
            recommendation, S.IN_PROGRESS, user,
            "implementation_returned_by_head", notes=notes,
        )
        _notify(
            [_assignee(recommendation)],
            recommendation,
            Notification.Type.RETURNED,
            msg("implementation_returned", f"أعادت الإدارة التنفيذ للمزيد من العمل على {_rec_ref(recommendation)}: {notes}", ref=_rec_ref(recommendation), notes=notes),
        )
    return recommendation
