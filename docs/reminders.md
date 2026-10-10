# Reminders

Deadline reminders are sent by one engine,
`backend/apps/notifications/services.py`, run daily by Vercel Cron
(`GET /api/internal/send-reminders/`, `Authorization: Bearer <CRON_SECRET>`)
or by hand (`python manage.py send_reminders`). It is safe to run any number
of times a day and after any number of missed days.

## Rules

A `ReminderRule` (per municipality, editable in Settings → Reminders by
internal audit) is a milestone relative to a deadline:

- `offset_days` < 0: N days before; 0: on the day; > 0: N days after.
- `recipient_role`: employee, department head or internal audit.
- `enabled`.

Default schedule for a new municipality:

| Recipient | Offsets (days) |
|---|---|
| Responsible employee | −14, −7, −3, −1, 0, +1, +7, +14 |
| Department head | −3, 0, +3, +7 |
| Internal audit (escalation) | +1, +7, +14 |

Existing municipalities are never changed by a deployment. To add only the
missing defaults (never editing or deleting configured rules):
`python manage.py ensure_reminder_defaults` (preview) then `--apply`
(optionally `--municipality "<name>"`). See [../DEPLOY.md](../DEPLOY.md).

## Which deadline, and who is reminded

Deadlines follow the workflow rules ([workflow.md](workflow.md)):

| Case | Deadline (anchor) | Recipients |
|---|---|---|
| In execution (in progress, returned, partial, reopened) | binding deadline: plan date, or the audit-set deadline after a partial/insufficient verification (W1) | the responsible employee, the department's heads, audit (escalation rules) |
| Awaiting the department's response | the report's response deadline | the department's heads, audit (escalation rules) |
| Waiting on audit or the council | none — not the department's delay (W2) | — |

The employee is only reminded while the case is in execution and assigned
to them. Notification types: response needed / deadline approaching / due
today / overdue.

## Catch-up and deduplication

A milestone is **due** once `today ≥ deadline + offset`. On each pass, for
every case and recipient, the engine looks at the due milestones that have
no dispatch record yet:

- the **latest** due milestone is sent;
- earlier ones are recorded as `superseded` and never sent later.

So a cron that missed a week produces one current reminder, not a burst,
and a "3 days left" message is never sent after the deadline. Messages state
the actual distance to the deadline on the day they are sent.

Every milestone is recorded in `ReminderDispatch`, keyed by rule, case,
recipient, deadline source and deadline date (unique). Deleting a
notification therefore never causes a re-send, and moving a deadline starts
a new cycle. Each case lists the reminders sent on it in its History
section.

## Monitoring

Each pass is a `ReminderRun` (trigger `cron` or `command`, sent,
superseded, status, error). `GET /api/reminder-rules/status/` (audit)
returns the last run, the last successful run, `healthy` (a successful run
within 36 hours) and the number of missing default rules; the reminder
settings page shows it and warns when the engine looks stopped.
