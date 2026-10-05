# Workflow

How a recommendation moves from an audit finding to a council closure, who
acts at each point, and how deadlines and "overdue" are decided.

One module owns these rules: `backend/apps/workflow/presentation.py` (what a
status means, who acts, the binding deadline) together with
`backend/apps/workflow/guards.py` (who may do what, and why not) and
`backend/apps/workflow/transitions.py` (which status may follow which). The
service layer (`backend/apps/workflow/services/`) is the only code that
changes a status; every change writes an append-only `AuditTrail` entry with
`from_status` / `to_status`.

## Statuses and the ten stages

| Stage | Statuses | Who acts next |
|---|---|---|
| 1 Audit preparation | `draft` | Internal audit |
| 2 Department response | `pending_response`, `returned_for_revision` | Department head |
| 3 Audit review | `audit_review` | Internal audit |
| 4 Council ratification | `pending_council`, `approved_for_implementation` | Audit until the report is sent, then the council; then the head (plan) |
| 5 Action plan | `action_plan_required`, `action_plan_review`, `revision_required`, `action_plan_approved` | Head (submit / revise), audit (review) |
| 6 Implementation | `in_progress`, `returned_insufficient`, `partial`, `reopened` | Responsible employee |
| 7 Head review | `pending_head_review` | Department head |
| 8 Audit verification | `submitted_for_verification`, `closure_review` | Internal audit |
| 9 Closure | `pending_closure_council` | Council |
| 10 Closed | `closed` (resolution: implemented / disagreement accepted) | — |

`returned_for_revision`, `revision_required`, `returned_insufficient`,
`partial` and `reopened` are "sent back" statuses: the UI shows the stage as
returned and counts the returns per stage.

A `pending_council` case waits on **audit** while its report is still under
audit review (audit sends the whole report once every recommendation in it is
approved) and on the **council** once the report has been submitted.

## Actions and guards

Every action has one rule in `guards.ACTIONS` (statuses, roles, the error
code when the status is wrong), plus ownership (department / assignee),
applicability and preconditions. `available_actions(rec, user)` returns
every action offered to the user with `enabled` and its `blockers`; the API
enforces the same rules (`guards.require`), so the UI never decides
permissions itself.

| Action | Statuses | Roles |
|---|---|---|
| `edit_draft` | draft | audit |
| `respond` | pending_response, returned_for_revision | department head |
| `review_response` | audit_review | audit |
| `submit_plan` | action_plan_required, revision_required | department head |
| `review_plan` | action_plan_review | audit |
| `update_progress`, `mark_implemented` | in_progress, returned_insufficient, partial, reopened | employee (assignee), head |
| `upload_evidence`, `delete_evidence` | the above + pending_head_review, submitted_for_verification | employee (assignee), head |
| `review_implementation` | pending_head_review | department head |
| `verify` | submitted_for_verification | audit |
| `submit_for_closure` | closure_review | audit |
| `council_closure` | pending_closure_council | council |
| `confirm_recurrence` | any | audit |

Report-level steps (send to the department, send to the council, ratify) are
offered on each case as `workflow.report_action` and performed on the report.

`workflow.primary_action` is the one action the case screen leads with
(desktop action card, phone sticky button). When `mark_implemented` is
blocked only by missing evidence the primary action becomes
`upload_evidence`, otherwise `update_progress`.

## Deadlines and overdue (W1, W2)

The **binding deadline** is the date the department is held to now:

| Situation | Binding deadline | `deadline_source` |
|---|---|---|
| Awaiting the department's response | the report's response deadline | `response` |
| Implementation after a `partial` / `insufficient` verification | the deadline audit set in that decision (W1) | `verification` |
| Implementation otherwise | the action plan's target date | `plan` |
| Any other status | none | — |

The plan's own date stays visible as `target_date` / "original plan date".

**Overdue** (department overdue) = the binding deadline has passed **and**
the department or employee owns the next action (statuses in
`DEPARTMENT_DEADLINE_STATUSES`). Time a case spends waiting on audit or the
council is never counted against the department (W2); it is shown as queue
age (`days_waiting`, "waiting on X since …"). A late response is reported
separately (`response_overdue`).

The same rule is used by the list badge, the register filter
(`?overdue=true`), every dashboard, analytics, follow-up snapshots and the
reminder engine.

## Combined closure (W4)

When audit verifies a case as **sufficient**, the form offers "Sufficient +
send to the Council" (on by default). The server performs both steps —
`submitted_for_verification → closure_review → pending_closure_council` —
writing the verification decision, the closure-review approval and one trail
entry per transition, exactly as if they were taken separately.

## The workflow contract

`python manage.py export_workflow_contract` writes
`frontend/lib/contract/workflow.json` (stage order, status → stage, labels,
next role). The frontend reads it instead of hard-coding statuses.
`--check` fails when the file is stale; CI runs it, and a drift test exists
on both sides.

The case payload carries a `workflow` block (stage, waiting_on, next actor,
waiting since, binding deadline and source, overdue, due in, my_turn,
available actions with blockers, primary and report actions). List rows carry
the same facts in flat fields (`stage`, `waiting_on`, `deadline`,
`deadline_source`, `days_overdue`, `due_in_days`, `days_waiting`,
`my_turn`), computed in SQL by `annotate_workflow`.

## Error codes

Every workflow refusal and API error has a stable `code` (and `params`),
catalogued in `backend/apps/core/error_codes.py`. The frontend translates
codes (`T.apiErrors`); the server's English `detail` is never shown on an
Arabic screen. A test keeps the catalog and the translations in step.
