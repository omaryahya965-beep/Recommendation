"""Verification, the closure package and the council's closure decision.

Verification never closes: sufficient evidence starts closure review, and
only the council closes.
"""
from django.utils import timezone

from apps.audits.models import Recommendation
from apps.core.arabic import date_ar
from apps.core.exceptions import WorkflowError
from apps.notifications.models import Notification

from .. import guards
from ..models import ApprovalRecord, VerificationDecision
from ..transitions import transition
from .common import locked_transition
from .notify import (
    msg,
    _VERIFICATION_LABELS_AR,
    _assignee,
    _audit_users,
    _council_users,
    _heads_of,
    _notify,
    _rec_ref,
)

S = Recommendation.Status


@locked_transition
def verify(recommendation, user, decision, notes="", rejected_items="", rejection_reason="",
           required_action="", action_deadline=None, notify=True):
    guards.require("verify", recommendation, user)

    D = VerificationDecision.Decision
    if decision != D.SUFFICIENT:
        missing = []
        if not rejected_items.strip():
            missing.append("rejected_items")
        if not rejection_reason.strip():
            missing.append("rejection_reason")
        if not required_action.strip():
            missing.append("required_action")
        if action_deadline is None:
            missing.append("action_deadline")
        if missing:
            raise WorkflowError(
                "A non-sufficient verification must specify: " + ", ".join(missing) + ".",
                code="verification_fields_required",
                params={"fields": missing},
            )
        # This deadline becomes binding for the returned work (W1), so it
        # cannot already have passed.
        if action_deadline < timezone.localdate():
            raise WorkflowError(
                "The deadline for the returned work cannot be in the past.",
                code="deadline_in_past",
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
        if notify:
            _notify(
                list(_heads_of(recommendation)) + [_assignee(recommendation)],
                recommendation,
                Notification.Type.STATUS_CHANGE,
                msg("verification_sufficient", f"قبل التدقيق أدلة {_rec_ref(recommendation)}. التوصية في مراجعة الإغلاق.", ref=_rec_ref(recommendation)),
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
                msg(
                    "verification_returned",
                    f"قرار التحقق على {_rec_ref(recommendation)}: {_VERIFICATION_LABELS_AR.get(decision, decision)}. "
                    f"المرفوض: {rejected_items}. السبب: {rejection_reason}. "
                    f"المطلوب: {required_action}. الموعد النهائي: {date_ar(action_deadline)}.",
                    ref=_rec_ref(recommendation), decision=decision, rejected_items=rejected_items,
                    reason=rejection_reason, action=required_action,
                    deadline=str(action_deadline) if action_deadline else "",
                )
            ),
        )
    return verification


@locked_transition
def submit_for_closure(recommendation, user, notes=""):
    """Audit completes the Recommendation Closure Review and sends it to council."""
    guards.require("submit_for_closure", recommendation, user)
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
        msg("closure_council_needed", f"توصية بانتظار مراجعة المجلس لإغلاقها — {_rec_ref(recommendation)}.", ref=_rec_ref(recommendation)),
    )
    _notify(
        list(_heads_of(recommendation)) + [_assignee(recommendation)],
        recommendation,
        Notification.Type.STATUS_CHANGE,
        msg("closure_sent", f"أُرسلت {_rec_ref(recommendation)} إلى المجلس لمراجعة الإغلاق.", ref=_rec_ref(recommendation)),
    )
    return recommendation


@locked_transition
def verify_and_submit_for_closure(recommendation, user, notes="", closure_notes=""):
    """Audit's combined action (W4): evidence sufficient AND send to council.

    Nothing is skipped: the case moves submitted_for_verification ->
    closure_review -> pending_closure_council, writing the verification
    decision, the closure-review approval and one audit-trail entry per
    transition, exactly as when the two steps are taken separately. Only the
    intermediate "now in closure review" notice is not sent, because the
    case leaves that status in the same moment.
    """
    verification = verify(
        recommendation, user, decision=VerificationDecision.Decision.SUFFICIENT,
        notes=notes, notify=False,
    )
    submit_for_closure(recommendation, user, notes=closure_notes or notes)
    return verification


@locked_transition
def council_closure(recommendation, user, accept, notes=""):
    """Council reviews the follow-up / closure package.

    Agree -> CLOSED. Disagree -> REOPENED for further action.
    """
    guards.require("council_closure", recommendation, user)
    if not accept and not notes.strip():
        raise WorkflowError(
            "Reopening a recommendation requires written notes for further action.",
            code="reopen_notes_required",
        )

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
            msg("council_closed", f"أغلق المجلس التوصية {_rec_ref(recommendation)}.", ref=_rec_ref(recommendation)),
        )
    else:
        transition(recommendation, S.REOPENED, user, "council_reopened_recommendation", notes=notes)
        _notify(
            list(_heads_of(recommendation))
            + [_assignee(recommendation)]
            + list(_audit_users(recommendation.report.municipality)),
            recommendation,
            Notification.Type.RETURNED,
            msg("council_reopened", f"المجلس طلب إجراءً إضافياً ولم يُغلق {_rec_ref(recommendation)}: {notes}", ref=_rec_ref(recommendation), notes=notes),
        )
    return recommendation
