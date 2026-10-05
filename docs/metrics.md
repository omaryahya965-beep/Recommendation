# Metric definitions

Every number Raqeeb shows is computed on the server from the caller's own
scoped data (municipality and role), with **one** set of definitions, so a
dashboard tile, the analytics page, a follow-up report and the register
list it links to can never disagree.

Sources of truth:

- `backend/apps/core/analytics.py` — portfolio totals and analytics
  (`definitions_version: 2`).
- `backend/apps/core/dashboard.py` — role dashboards (`version: 2`) and
  navigation badges.
- `backend/apps/workflow/presentation.py` — overdue, waiting on, binding
  deadline, queue age (see [workflow.md](workflow.md)).
- `backend/apps/followup/` — follow-up snapshots (`methodology_version: 2`).

## Portfolio (analytics and dashboard KPIs)

| Metric | Definition |
|---|---|
| Operational total | Issued recommendations (status ≠ draft). The base of every count and rate. Drafts are audit working material, reported separately (`drafts`, audit only). |
| Open / closed | Operational and not closed / closed. Closed is split by resolution: implemented vs disagreement accepted. |
| Completion rate | closed ÷ operational total. |
| Overdue | Department overdue: the binding deadline has passed while the department owns the next action (W1, W2). |
| Overdue rate | overdue ÷ open cases that have a binding deadline (a case without one cannot be late). |
| High-risk open | risk = high and open. |
| In execution | in progress, returned (insufficient), partial, reopened. |
| Awaiting … | head review / audit verification / council closure. |
| Department execution rate | closed as implemented ÷ cases that reached the action-plan stage or later, excluding accepted disagreements. |
| Average progress | mean plan progress over open cases in execution only. |
| Created per month | operational recommendations by `created_at` month. |
| Closed per month | closed recommendations by `closed_at` month (never mixed with "created"). |

Analytics responses are cached for at most 90 seconds per scope and
invalidated on every workflow change.

## Role dashboards (version 2)

Each block is `{count, items}`: the count is exact, items are at most ten.
Every block links to the register with the filter that produced it, so the
count equals the list.

| Role | Block | Rule | Register link |
|---|---|---|---|
| Audit | Responses / plans / verifications / closures to review | status = audit_review / action_plan_review / submitted_for_verification / closure_review | `?status=…` |
| Audit | Overdue | department overdue | `?overdue=1` |
| Audit | Reports ready for the council | report under review and every recommendation in it at `pending_council` | report page |
| Audit | Draft reports | report status draft | report page |
| Audit | Late in our queue | waiting on audit for more than 7 days | `?waiting_on=audit&waiting_over=7` |
| Audit | High risk, no movement | open, high risk, status unchanged for more than 30 days | `?risk_level=high&open=true&waiting_over=30` |
| Audit | Overdue by department | overdue and open per department | `?overdue=1&report__department=<id>` |
| Audit | Possible recurrences | flagged recurring, not yet confirmed | `?is_recurring=true&recurrence_confirmed=false` |
| Head | Responses needed | pending_response, returned_for_revision | `?status__in=…` |
| Head | Plans needed | approved_for_implementation, action_plan_required, revision_required | `?status__in=…` |
| Head | Implementations to review | pending_head_review | `?status=pending_head_review` |
| Head | Due this week | department-owned, binding deadline in the next 7 days | `?due_within=7` |
| Head | Waiting on audit or the council | not the department's delay (W2) | `?waiting_on=audit,council` |
| Head | Team | open and overdue per employee | `?responsible_employee=<id>&open=true` |
| Employee | Returned to you | returned_insufficient, partial, reopened | `?status__in=…` |
| Employee | Upcoming deadlines | department-owned, binding deadline in the next 30 days | `?due_within=30` |
| Employee | Waiting on reviewers | pending_head_review, submitted_for_verification, closure_review, pending_closure_council | `?status__in=…` |
| Council | Reports to ratify / closures pending | report pending_council / pending_closure_council | decision pages |
| Council | Reopened | status reopened | `?status=reopened` |
| Council | Recent decisions | the last ten ratifications, closures and reopenings (from the trail) | — |

"Days in this queue" (`days_waiting`) counts local calendar days since the
case entered its current status (its last trail transition into it).

### Navigation badges

`/api/nav-counts/` returns counts only and is polled on every page.
"Recommendations" counts the viewer's own turn (the register's
`?my_turn=true`); audit's "Reports" counts reports ready for the council;
the council's two queues count reports to ratify and closures pending.

## Follow-up reports (methodology version 2)

A follow-up report for a period describes the register **as it stood at the
end of the period**, reconstructed from the append-only audit trail (status
at any moment = the last transition at or before it; the plan date and the
W1 deadline in force at that moment come from the trail and the verification
decisions recorded by then). Snapshots are frozen when saved.

| Total | Definition (as of the period end unless stated) |
|---|---|
| Total | recommendations issued by the period end |
| Open at start / open at end | open at the period start / end |
| Issued in period | first issued (sent to the department) during the period |
| Closed in period | closed during the period, split into implemented and disagreement accepted |
| Completion rate | closed ÷ total |
| Overdue / overdue rate | department overdue at the period end ÷ open cases with a plan or verification deadline |
| Became overdue in period | overdue at the period end with a binding deadline that fell inside the period |
| Late in review | waiting on audit or the council at the period end, past the plan date — shown separately, never counted as department delay (W2) |
| Response overdue | department response late at the period end |
| High-risk open | high risk and open at the period end |
| By stage | the ten-stage distribution at the period end |
| History incomplete | cases reconstructed from their current state (see below) |

Cases without any status history (created outside the workflow services)
fall back to their current state and are flagged `history_incomplete`.
