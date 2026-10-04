"""Every machine-readable error `code` the API can return.

The frontend shows a translated message for each one (lib/i18n `errors`), so
English server wording never reaches an Arabic screen. Three-way drift guard:

* apps/workflow/tests/test_contract.py scans the backend source and fails if a
  raised code is missing here;
* `manage.py export_workflow_contract` copies this list into
  frontend/lib/contract/workflow.json (a test fails if that file is stale);
* frontend/lib/contract.test.ts fails if a code has no ar/en message.
"""

# Domain rules (WorkflowError, 409) and blockers.
WORKFLOW_ERROR_CODES = (
    # state machine
    "invalid_transition",
    "forbidden_transition",
    "forbidden_action",
    "workflow_error",
    # reports
    "report_not_draft",
    "report_empty",
    "report_not_under_review",
    "report_has_unapproved",
    "report_not_pending_council",
    # response
    "not_awaiting_response",
    "not_own_department",
    "disagreement_requires_justification",
    "attachment_required",
    "plan_required_with_response",
    "response_not_under_review",
    "no_response",
    "review_notes_required",
    # plan
    "not_awaiting_plan",
    "plan_not_under_review",
    "no_plan",
    "employee_not_found",
    "employee_wrong_department",
    "employee_wrong_role",
    # execution
    "not_in_execution",
    "no_approved_plan",
    "not_responsible_employee",
    "executor_only",
    "step_wrong_plan",
    "step_dependency_incomplete",
    "progress_out_of_range",
    "evidence_not_allowed",
    "evidence_delete_not_allowed",
    "evidence_wrong_step",
    "evidence_wrong_case",
    "evidence_not_owner",
    "file_required",
    "not_markable",
    "required_steps_incomplete",
    "evidence_required",
    "not_awaiting_head_review",
    # verification and closure
    "not_submitted_for_verification",
    "verification_fields_required",
    "deadline_in_past",
    "send_to_council_requires_sufficient",
    "not_in_closure_review",
    "not_pending_closure_council",
    "reopen_notes_required",
    # recurrence and drafts
    "not_flagged_recurring",
    "draft_only",
    # uploads and storage
    "invalid_upload",
    "upload_type_not_allowed",
    "upload_too_large",
    "upload_not_found",
    "direct_upload_unavailable",
    "storage_unavailable",
    # AI (advisory)
    "ai_error",
    "ai_unavailable",
    "ai_invalid_output",
    "not_eligible",
)

# Generic DRF / auth codes.
API_ERROR_CODES = (
    "validation_error",
    "not_authenticated",
    "authentication_failed",
    "permission_denied",
    "not_found",
    "method_not_allowed",
    "throttled",
    "parse_error",
    "token_not_valid",
    "unsupported_media_type",
)

# Per-field validation codes (`field_codes` of a validation_error).
FIELD_ERROR_CODES = (
    "required",
    "blank",
    "null",
    "invalid",
    "invalid_choice",
    "max_value",
    "min_value",
    "max_length",
    "min_length",
    "does_not_exist",
    "unique",
)

ERROR_CODES = WORKFLOW_ERROR_CODES + API_ERROR_CODES
