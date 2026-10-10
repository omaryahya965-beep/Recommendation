"""What a user may do to a recommendation right now, and why not.

One table drives both directions:

* `available_actions(rec, user)` tells the UI which actions to offer and, for
  an offered action whose preconditions are not met yet, the blocker codes to
  show next to it ("two required steps are not done");
* the service functions call `require(action, rec, user)` with the same rules
  before they change anything, so what the UI is told and what the API
  enforces cannot drift apart.

The DRF permission classes on each endpoint still run first, and the state
machine in `transitions.py` still validates every status change. The frontend
only displays these answers; it never grants anything.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.exceptions import WorkflowError

S = Recommendation.Status
R = User.Role

EXECUTION_STATUSES = (S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)
EVIDENCE_STATUSES = EXECUTION_STATUSES + (S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION)


@dataclass(frozen=True)
class Blocker:
    code: str
    params: dict = field(default_factory=dict)

    def as_dict(self):
        return {"code": self.code, "params": self.params} if self.params else {"code": self.code}


@dataclass(frozen=True)
class ActionRule:
    id: str
    statuses: tuple
    roles: tuple
    # Error code when the current status does not allow the action.
    wrong_state: str


ACTIONS: dict[str, ActionRule] = {
    rule.id: rule
    for rule in (
        ActionRule("edit_draft", (S.DRAFT,), (R.AUDIT,), "draft_only"),
        ActionRule(
            "respond",
            (S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION),
            (R.DEPARTMENT_HEAD,),
            "not_awaiting_response",
        ),
        ActionRule("review_response", (S.AUDIT_REVIEW,), (R.AUDIT,), "response_not_under_review"),
        ActionRule(
            "submit_plan",
            (S.ACTION_PLAN_REQUIRED, S.REVISION_REQUIRED),
            (R.DEPARTMENT_HEAD,),
            "not_awaiting_plan",
        ),
        ActionRule("review_plan", (S.ACTION_PLAN_REVIEW,), (R.AUDIT,), "plan_not_under_review"),
        ActionRule(
            "update_progress", EXECUTION_STATUSES, (R.EMPLOYEE, R.DEPARTMENT_HEAD), "not_in_execution"
        ),
        ActionRule(
            "upload_evidence", EVIDENCE_STATUSES, (R.EMPLOYEE, R.DEPARTMENT_HEAD), "evidence_not_allowed"
        ),
        ActionRule(
            "delete_evidence",
            EVIDENCE_STATUSES,
            (R.EMPLOYEE, R.DEPARTMENT_HEAD),
            "evidence_delete_not_allowed",
        ),
        ActionRule(
            "mark_implemented", EXECUTION_STATUSES, (R.EMPLOYEE, R.DEPARTMENT_HEAD), "not_markable"
        ),
        ActionRule(
            "review_implementation",
            (S.PENDING_HEAD_REVIEW,),
            (R.DEPARTMENT_HEAD,),
            "not_awaiting_head_review",
        ),
        ActionRule(
            "verify", (S.SUBMITTED_FOR_VERIFICATION,), (R.AUDIT,), "not_submitted_for_verification"
        ),
        ActionRule("submit_for_closure", (S.CLOSURE_REVIEW,), (R.AUDIT,), "not_in_closure_review"),
        ActionRule(
            "council_closure",
            (S.PENDING_CLOSURE_COUNCIL,),
            (R.COUNCIL,),
            "not_pending_closure_council",
        ),
        ActionRule("confirm_recurrence", tuple(S.values), (R.AUDIT,), "not_flagged_recurring"),
    )
}


# ---------------------------------------------------------------------------
# Ownership: who among the allowed roles may act on THIS case.
# A failure here means the action is not offered at all.
# ---------------------------------------------------------------------------
def own_department(rec, user) -> Blocker | None:
    if user.department_id != rec.report.department_id:
        return Blocker("not_own_department")
    return None


def _plan(rec):
    try:
        return rec.action_plan
    except Recommendation.action_plan.RelatedObjectDoesNotExist:
        return None


def executor(rec, user) -> Blocker | None:
    """The responsible employee, or the head of the audited department."""
    plan = _plan(rec)
    if plan is None:
        return Blocker("no_approved_plan")
    if user.role == R.EMPLOYEE:
        if plan.responsible_employee_id != user.id:
            return Blocker("not_responsible_employee")
        return None
    if user.role == R.DEPARTMENT_HEAD:
        return own_department(rec, user)
    return Blocker("executor_only")


OWNERSHIP = {
    "respond": own_department,
    "submit_plan": own_department,
    "review_implementation": own_department,
    "update_progress": executor,
    "upload_evidence": executor,
    "delete_evidence": executor,
    "mark_implemented": executor,
}


# ---------------------------------------------------------------------------
# Applicability: actions that only exist for some cases. Not offered otherwise.
# ---------------------------------------------------------------------------
def _recurrence_pending(rec, user) -> Blocker | None:
    if not rec.is_recurring:
        return Blocker("not_flagged_recurring")
    return None


def _report_is_draft(rec, user) -> Blocker | None:
    if rec.report.status != AuditReport.Status.DRAFT:
        return Blocker("draft_only")
    return None


APPLICABLE = {
    "confirm_recurrence": _recurrence_pending,
    "edit_draft": _report_is_draft,
}


# ---------------------------------------------------------------------------
# Preconditions: the action is offered, but disabled until these are met.
# ---------------------------------------------------------------------------
def incomplete_required_steps(rec) -> list[str]:
    """Titles of required steps not done yet (uses prefetched steps if present)."""
    plan = _plan(rec)
    if plan is None:
        return []
    return [
        step.title
        for step in sorted(plan.steps.all(), key=lambda step: (step.order, step.id))
        if step.is_required_for_closure and not step.is_done
    ]


def has_evidence(rec) -> bool:
    cache = getattr(rec, "_prefetched_objects_cache", {}) or {}
    if "evidence_files" in cache:
        return bool(cache["evidence_files"])
    return rec.evidence_files.exists()


def mark_implemented_blockers(rec, user) -> list[Blocker]:
    blockers = []
    pending = incomplete_required_steps(rec)
    if pending:
        blockers.append(Blocker("required_steps_incomplete", {"steps": pending[:5], "count": len(pending)}))
    if not has_evidence(rec):
        blockers.append(Blocker("evidence_required"))
    return blockers


def _needs_plan(rec, user) -> list[Blocker]:
    return [] if _plan(rec) is not None else [Blocker("no_plan")]


def _response_present(rec):
    try:
        return rec.response
    except Recommendation.response.RelatedObjectDoesNotExist:
        return None


def _needs_response_safe(rec, user) -> list[Blocker]:
    return [] if _response_present(rec) is not None else [Blocker("no_response")]


PRECONDITIONS = {
    "mark_implemented": mark_implemented_blockers,
    "review_response": _needs_response_safe,
    "review_plan": _needs_plan,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Availability:
    id: str
    enabled: bool
    blockers: tuple = ()

    def as_dict(self):
        return {
            "id": self.id,
            "enabled": self.enabled,
            "blockers": [blocker.as_dict() for blocker in self.blockers],
        }


def check(action_id: str, rec, user) -> Availability | None:
    """None when the action is not offered to this user for this case at all;
    otherwise whether it is enabled, and the blockers when it is not."""
    rule = ACTIONS[action_id]
    if rec.status not in rule.statuses or getattr(user, "role", None) not in rule.roles:
        return None
    for gate in (OWNERSHIP.get(action_id), APPLICABLE.get(action_id)):
        if gate is not None and gate(rec, user) is not None:
            return None
    preconditions = PRECONDITIONS.get(action_id)
    blockers = tuple(preconditions(rec, user)) if preconditions else ()
    return Availability(action_id, not blockers, blockers)


def available_actions(rec, user) -> list[Availability]:
    return [item for item in (check(action_id, rec, user) for action_id in ACTIONS) if item]


def require(action_id: str, rec, user) -> None:
    """Raise the WorkflowError the API returns when the action is not allowed.

    Order matters for the message: wrong status first, then wrong person, then
    unmet preconditions.
    """
    rule = ACTIONS[action_id]
    if rec.status not in rule.statuses:
        raise WorkflowError(
            f"Action '{action_id}' is not available while the recommendation is '{rec.status}'.",
            code=rule.wrong_state,
            params={"status": rec.status},
        )
    if getattr(user, "role", None) not in rule.roles:
        raise WorkflowError(
            f"Role '{getattr(user, 'role', '')}' may not perform '{action_id}'.",
            code="forbidden_action",
            params={"action": action_id},
        )
    for gate in (OWNERSHIP.get(action_id), APPLICABLE.get(action_id)):
        blocker = gate(rec, user) if gate else None
        if blocker is not None:
            raise WorkflowError(BLOCKER_TEXT.get(blocker.code, blocker.code), code=blocker.code, params=blocker.params)
    preconditions = PRECONDITIONS.get(action_id)
    for blocker in (preconditions(rec, user) if preconditions else ()):
        raise WorkflowError(BLOCKER_TEXT.get(blocker.code, blocker.code), code=blocker.code, params=blocker.params)


# English text for API clients and logs; the UI translates by code.
BLOCKER_TEXT = {
    "not_own_department": "You can only act within your own department.",
    "no_approved_plan": "No approved action plan exists for this recommendation.",
    "not_responsible_employee": "Only the responsible employee may update this recommendation.",
    "executor_only": "Only the responsible employee or department head may do this.",
    "not_flagged_recurring": "This recommendation is not flagged as possibly recurring.",
    "draft_only": "Only draft recommendations in a draft report can be edited.",
    "required_steps_incomplete": "Required steps are not completed yet.",
    "evidence_required": "At least one evidence file is required before submission.",
    "no_response": "No management response exists to review.",
    "no_plan": "No action plan exists to review.",
}
