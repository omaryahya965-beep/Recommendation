"""Recommendation workflow state machine.

Every status change in the system flows through `transition()`. The frontend
can never set a status directly: each API action maps to a named operation in
`services.py`, which validates the move here and writes an append-only
AuditTrail entry.

Default flow:

  draft
    -> pending_response            (audit sends report to department)
    -> audit_review                (department submits management response)
    -> returned_for_revision       (audit rejects response)  -> audit_review
    -> pending_council             (audit approves: AUDIT_APPROVAL record)
    -> approved_for_implementation (council ratifies: COUNCIL_RATIFICATION)
    -> action_plan_required        (auto)
    -> action_plan_review          (department submits plan + assigns tasks)
    -> revision_required           (audit requests plan revision)
    -> action_plan_approved        (audit approves plan)
    -> in_progress                 (auto; employee executes + uploads evidence)
    -> pending_head_review         (employee marks implemented; head reviews)
    -> submitted_for_verification  (head submits to internal audit)
    -> returned_insufficient | partial  (audit: evidence not sufficient)
    -> closure_review              (audit: evidence sufficient)
    -> pending_closure_council     (audit sends closure package to council)
    -> closed                      (council agrees)
    -> reopened                    (council disagrees / further action)
"""
from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import log_action

S = Recommendation.Status
R = User.Role

# {from_status: {to_status: (roles allowed to trigger it)}}
# "system" marks auto-transitions performed inside a service function.
SYSTEM = "system"

ALLOWED_TRANSITIONS = {
    S.DRAFT: {
        S.PENDING_RESPONSE: (R.AUDIT,),
    },
    S.PENDING_RESPONSE: {
        S.AUDIT_REVIEW: (R.DEPARTMENT_HEAD,),
    },
    S.AUDIT_REVIEW: {
        S.RETURNED_FOR_REVISION: (R.AUDIT,),
        S.PENDING_COUNCIL: (R.AUDIT,),
    },
    S.RETURNED_FOR_REVISION: {
        S.AUDIT_REVIEW: (R.DEPARTMENT_HEAD,),
    },
    S.PENDING_COUNCIL: {
        S.APPROVED_FOR_IMPLEMENTATION: (R.COUNCIL,),
        S.CLOSED: (R.COUNCIL,),  # ratifying an accepted disagreement closes it
    },
    S.APPROVED_FOR_IMPLEMENTATION: {
        S.ACTION_PLAN_REQUIRED: (SYSTEM,),
        S.ACTION_PLAN_APPROVED: (SYSTEM,),  # plan pre-approved with response (policy)
    },
    S.ACTION_PLAN_REQUIRED: {
        S.ACTION_PLAN_REVIEW: (R.DEPARTMENT_HEAD,),
    },
    S.ACTION_PLAN_REVIEW: {
        S.REVISION_REQUIRED: (R.AUDIT,),
        S.ACTION_PLAN_APPROVED: (R.AUDIT,),
    },
    S.REVISION_REQUIRED: {
        S.ACTION_PLAN_REVIEW: (R.DEPARTMENT_HEAD,),
    },
    S.ACTION_PLAN_APPROVED: {
        S.IN_PROGRESS: (SYSTEM,),
    },
    S.IN_PROGRESS: {
        S.PENDING_HEAD_REVIEW: (R.EMPLOYEE, R.DEPARTMENT_HEAD),
    },
    S.PENDING_HEAD_REVIEW: {
        S.IN_PROGRESS: (R.DEPARTMENT_HEAD,),
        S.SUBMITTED_FOR_VERIFICATION: (R.DEPARTMENT_HEAD,),
    },
    S.SUBMITTED_FOR_VERIFICATION: {
        S.CLOSURE_REVIEW: (R.AUDIT,),
        S.PARTIAL: (R.AUDIT,),
        S.RETURNED_INSUFFICIENT: (R.AUDIT,),
    },
    S.RETURNED_INSUFFICIENT: {
        S.IN_PROGRESS: (SYSTEM,),
        S.PENDING_HEAD_REVIEW: (R.EMPLOYEE, R.DEPARTMENT_HEAD),
    },
    S.PARTIAL: {
        S.IN_PROGRESS: (SYSTEM,),
        S.PENDING_HEAD_REVIEW: (R.EMPLOYEE, R.DEPARTMENT_HEAD),
    },
    S.CLOSURE_REVIEW: {
        S.PENDING_CLOSURE_COUNCIL: (R.AUDIT,),
    },
    S.PENDING_CLOSURE_COUNCIL: {
        S.CLOSED: (R.COUNCIL,),
        S.REOPENED: (R.COUNCIL,),
    },
    S.REOPENED: {
        S.IN_PROGRESS: (SYSTEM,),
        S.PENDING_HEAD_REVIEW: (R.EMPLOYEE, R.DEPARTMENT_HEAD),
    },
    S.CLOSED: {},
}


def transition(recommendation, to_status, user, action, system=False, **metadata):
    """Validate and perform a status change, logging it immutably.

    Raises WorkflowError when the move is not allowed from the current status
    or the user's role may not trigger it.
    """
    from_status = recommendation.status
    allowed = ALLOWED_TRANSITIONS.get(from_status, {})
    if to_status not in allowed:
        raise WorkflowError(
            f"Invalid transition: {from_status} -> {to_status}.",
            code="invalid_transition",
        )
    roles = allowed[to_status]
    if system:
        if SYSTEM not in roles:
            raise WorkflowError(
                f"Transition {from_status} -> {to_status} cannot be system-triggered.",
                code="invalid_transition",
            )
    elif user.role not in roles:
        raise WorkflowError(
            f"Role '{user.role}' may not perform {from_status} -> {to_status}.",
            code="forbidden_transition",
        )

    recommendation.status = to_status
    updated = ["status", "updated_at"]
    # Every path into CLOSED runs through here, so closure is stamped exactly
    # once and never has to be inferred from updated_at.
    if to_status == S.CLOSED and recommendation.closed_at is None:
        from django.utils import timezone

        recommendation.closed_at = timezone.now()
        updated.append("closed_at")
    recommendation.save(update_fields=updated)
    log_action(
        user,
        action,
        recommendation=recommendation,
        report=recommendation.report,
        from_status=from_status,
        to_status=to_status,
        system=system,
        **metadata,
    )
    return recommendation
