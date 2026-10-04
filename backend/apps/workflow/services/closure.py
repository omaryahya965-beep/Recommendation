"""Verification, the closure package and the council's closure decision.

Verification never closes: sufficient evidence starts closure review.
"""
from django.db import transaction as db_transaction

from apps.audits.models import Recommendation
from apps.core.exceptions import WorkflowError
from apps.notifications.models import Notification

from ..models import ApprovalRecord, VerificationDecision
from ..transitions import transition
from .notify import (
    _VERIFICATION_LABELS_AR,
    _assignee,
    _audit_users,
    _council_users,
    _heads_of,
    _notify,
    _rec_ref,
)

S = Recommendation.Status


@db_transaction.atomic
def verify(recommendation, user, decision, notes="", rejected_items="", rejection_reason="",
           required_action="", action_deadline=None):
    if recommendation.status != S.SUBMITTED_FOR_VERIFICATION:
        raise WorkflowError("Only recommendations submitted for verification can be verified.")

    D = VerificationDecision.Decision
    if decision != D.SUFFICIENT:
        missing = []
        if not rejected_items.strip():
            missing.append("what was rejected (rejected_items)")
        if not rejection_reason.strip():
            missing.append("why (rejection_reason)")
        if not required_action.strip():
            missing.append("what is required next (required_action)")
        if action_deadline is None:
            missing.append("deadline (action_deadline)")
        if missing:
            raise WorkflowError(
                "A non-sufficient verification must specify: " + "; ".join(missing) + "."
            )

    plan = getattr(recommendation, "action_plan", None)
    assigned_to = plan.responsible_employee if plan else None

    verification = VerificationDecision.objects.create(
        recommendation=recommendation,
        decision=decision,
        reviewed_by=user,
        notes=notes,
        rejected_items=rejected_items,
        rejection_reason=rejection_reason,
        required_action=required_action,
        action_deadline=action_deadline,
        assigned_to=assigned_to if decision != D.SUFFICIENT else None,
    )

    if decision == D.SUFFICIENT:
        transition(recommendation, S.CLOSURE_REVIEW, user, "verified_sufficient", notes=notes)
        _notify(
            list(_heads_of(recommendation)) + [_assignee(recommendation)],
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"قبل التدقيق أدلة {_rec_ref(recommendation)}. التوصية في مراجعة الإغلاق.",
        )
    elif decision == D.PARTIAL:
        transition(recommendation, S.PARTIAL, user, "verified_partial", notes=notes)
    else:
        transition(recommendation, S.RETURNED_INSUFFICIENT, user, "verified_insufficient", notes=notes)

    if decision != D.SUFFICIENT:
        _notify(
            list(_heads_of(recommendation)) + [assigned_to],
            recommendation,
            Notification.Type.RETURNED,
            (
                f"قرار التحقق على {_rec_ref(recommendation)}: {_VERIFICATION_LABELS_AR.get(decision, decision)}. "
                f"المرفوض: {rejected_items}. السبب: {rejection_reason}. "
                f"المطلوب: {required_action}. الموعد النهائي: {action_deadline}."
            ),
        )
    return verification


@db_transaction.atomic
def submit_for_closure(recommendation, user, notes=""):
    """Audit completes the Recommendation Closure Review and sends it to council."""
    if recommendation.status != S.CLOSURE_REVIEW:
        raise WorkflowError("Only recommendations in closure review can be sent to council.")
    ApprovalRecord.objects.create(
        recommendation=recommendation,
        approval_type=ApprovalRecord.ApprovalType.CLOSURE_REVIEW,
        approved_by=user,
        notes=notes,
    )
    transition(
        recommendation, S.PENDING_CLOSURE_COUNCIL, user,
        "closure_submitted_to_council", notes=notes,
    )
    _notify(
        _council_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"توصية بانتظار مراجعة المجلس لإغلاقها — {_rec_ref(recommendation)}.",
    )
    _notify(
        list(_heads_of(recommendation)) + [_assignee(recommendation)],
        recommendation,
        Notification.Type.STATUS_CHANGE,
        f"أُرسلت {_rec_ref(recommendation)} إلى المجلس لمراجعة الإغلاق.",
    )
    return recommendation


@db_transaction.atomic
def council_closure(recommendation, user, accept, notes=""):
    """Council reviews the follow-up / closure package.

    Agree -> CLOSED. Disagree -> REOPENED for further action.
    """
    if recommendation.status != S.PENDING_CLOSURE_COUNCIL:
        raise WorkflowError("This recommendation is not awaiting council closure review.")
    if not accept and not notes.strip():
        raise WorkflowError("Reopening a recommendation requires written notes for further action.")

    ApprovalRecord.objects.create(
        recommendation=recommendation,
        approval_type=ApprovalRecord.ApprovalType.CLOSURE_COUNCIL,
        approved_by=user,
        notes=notes,
    )
    if accept:
        recommendation.resolution = Recommendation.Resolution.IMPLEMENTED
        recommendation.save(update_fields=["resolution", "updated_at"])
        transition(recommendation, S.CLOSED, user, "council_closed_recommendation", notes=notes)
        _notify(
            list(_audit_users(recommendation.report.municipality))
            + list(_heads_of(recommendation))
            + [_assignee(recommendation)],
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"أغلق المجلس التوصية {_rec_ref(recommendation)}.",
        )
    else:
        transition(recommendation, S.REOPENED, user, "council_reopened_recommendation", notes=notes)
        _notify(
            list(_heads_of(recommendation))
            + [_assignee(recommendation)]
            + list(_audit_users(recommendation.report.municipality)),
            recommendation,
            Notification.Type.RETURNED,
            f"المجلس طلب إجراءً إضافياً ولم يُغلق {_rec_ref(recommendation)}: {notes}",
        )
    return recommendation
