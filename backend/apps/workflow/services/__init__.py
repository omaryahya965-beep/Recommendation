"""Workflow operations.

Each function is the single entry point for one business action. All guards
live here (never in the frontend): transition validation, mandatory
justifications, closure rules, structured rejection feedback.

The implementation is split by lifecycle stage; this package re-exports the
public surface so callers keep using `from apps.workflow import services`.
"""
from .closure import council_closure, submit_for_closure, verify, verify_and_submit_for_closure
from .execution import (
    EXECUTION_STATUSES,
    _ensure_executor,
    _resume_if_returned,
    add_evidence,
    delete_evidence,
    mark_implemented,
    review_implementation,
    update_step_progress,
)
from .notify import _VERIFICATION_LABELS_AR, _notify
from .plan import _upsert_plan, review_action_plan, submit_action_plan
from .recurrence import confirm_recurrence
from .reports import ratify_report, submit_report_to_council, submit_report_to_department
from .response import review_response, submit_response

__all__ = [
    "EXECUTION_STATUSES",
    "add_evidence",
    "confirm_recurrence",
    "council_closure",
    "delete_evidence",
    "mark_implemented",
    "ratify_report",
    "review_action_plan",
    "review_implementation",
    "review_response",
    "submit_action_plan",
    "submit_for_closure",
    "submit_report_to_council",
    "submit_report_to_department",
    "submit_response",
    "update_step_progress",
    "verify",
    "verify_and_submit_for_closure",
]
