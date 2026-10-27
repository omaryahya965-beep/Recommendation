"""The department's management response and audit's review of it."""

from apps.audits.models import AuditReport, Recommendation
from apps.core.exceptions import StorageUnavailable, WorkflowError
from apps.core.files import bind_stored_name
from apps.core.uploads import claim_uploaded_file
from apps.notifications.models import Notification

from ..models import (
    ActionPlan,
    ApprovalRecord,
    ManagementResponse,
)
from .. import guards
from ..transitions import transition
from .plan import _upsert_plan
from .common import _policy, locked_transition
from .notify import (
    msg,
    _audit_users,
    _department_heads,
    _heads_of,
    _notify,
    _rec_ref,
)

S = Recommendation.Status


@locked_transition
def submit_response(recommendation, user, decision, justification="", attachment=None,
                    plan_data=None, stored_name=""):
    guards.require("respond", recommendation, user)
    if decision == ManagementResponse.Decision.DISAGREE and not justification.strip():
        raise WorkflowError(
            "Disagreement requires a written justification.",
            code="disagreement_requires_justification",
        )

    policy = _policy(recommendation.report)
    require_plan = bool(policy and policy.require_plan_with_response)
    if require_plan and decision == ManagementResponse.Decision.AGREE and not plan_data:
        raise WorkflowError(
            "Municipal policy requires the action plan to be submitted with the response.",
            code="plan_required_with_response",
        )

    response = getattr(recommendation, "response", None)
    if response is None:
        response = ManagementResponse(recommendation=recommendation, submitted_by=user)
    else:
        response.revision_count += 1
        response.submitted_by = user
    previous = {
        "decision": response.decision,
        "justification": response.justification,
        "review_status": response.review_status,
    } if response.pk else None
    response.decision = decision
    response.justification = justification
    try:
        if stored_name:
            # Never trust a client-supplied storage key: confirm with the
            # storage provider that this user uploaded it, into the right
            # folder, within the size and type limits.
            stored_name = claim_uploaded_file(
                stored_name, purpose="response", user=user
            )
            bind_stored_name(response, "attachment", stored_name)
        elif attachment is not None:
            response.attachment = attachment
        response.review_status = ManagementResponse.ReviewStatus.PENDING
        response.save()
    except OSError as exc:
        raise StorageUnavailable(
            "Could not store the uploaded file. File storage is unavailable."
        ) from exc

    if plan_data and decision == ManagementResponse.Decision.AGREE:
        _upsert_plan(recommendation, user, plan_data)

    transition(
        recommendation, S.AUDIT_REVIEW, user, "management_response_submitted",
        decision=decision, previous_response=previous,
    )
    if recommendation.report.status == AuditReport.Status.PENDING_RESPONSE:
        recommendation.report.status = AuditReport.Status.UNDER_REVIEW
        recommendation.report.save(update_fields=["status", "updated_at"])

    _notify(
        _audit_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        msg("response_submitted", f"رد إدارة جديد بانتظار مراجعة التدقيق الداخلي — {_rec_ref(recommendation)}.", ref=_rec_ref(recommendation)),
    )
    return response


@locked_transition
def review_response(recommendation, user, accept, notes=""):
    """Audit reviews the response (and plan, when submitted together) as one unit."""
    guards.require("review_response", recommendation, user)
    response = recommendation.response

    response.reviewed_by = user
    response.audit_review_notes = notes

    if accept:
        response.review_status = ManagementResponse.ReviewStatus.ACCEPTED
        response.save()
        plan = getattr(recommendation, "action_plan", None)
        policy = _policy(recommendation.report)
        if (
            policy and policy.require_plan_with_response
            and response.decision == ManagementResponse.Decision.AGREE
            and plan is not None
        ):
            plan.status = ActionPlan.Status.APPROVED
            plan.reviewed_by = user
            plan.review_notes = notes
            plan.save()
        ApprovalRecord.objects.create(
            recommendation=recommendation,
            approval_type=ApprovalRecord.ApprovalType.AUDIT_APPROVAL,
            approved_by=user,
            notes=notes,
        )
        transition(recommendation, S.PENDING_COUNCIL, user, "audit_approved_response", notes=notes)
        _notify(
            _heads_of(recommendation),
            recommendation,
            Notification.Type.STATUS_CHANGE,
            msg("response_accepted", f"قبل التدقيق رد الإدارة على {_rec_ref(recommendation)}. بانتظار رفع التقرير للمجلس.", ref=_rec_ref(recommendation)),
        )
    else:
        if not notes.strip():
            raise WorkflowError(
                "Rejecting a response requires review notes for the department.",
                code="review_notes_required",
            )
        response.review_status = ManagementResponse.ReviewStatus.REJECTED
        response.save()
        transition(
            recommendation, S.RETURNED_FOR_REVISION, user, "audit_rejected_response", notes=notes
        )
        _notify(
            _department_heads(recommendation.report.department),
            recommendation,
            Notification.Type.RETURNED,
            msg("response_returned", f"أُعيد رد الإدارة للتعديل على {_rec_ref(recommendation)}: {notes}", ref=_rec_ref(recommendation), notes=notes),
        )
    return response
