# Runbook

Setup, tests and day-to-day operations. Deployment itself is in
[../DEPLOY.md](../DEPLOY.md).

## Local databases (Windows)

| Port | Purpose | Start |
|---|---|---|
| 5433 | Development (`seed_demo`, your own data) | `powershell backend/scripts/start_db.ps1` |
| 5434 | Automated tests and the browser suite only | `powershell backend/scripts/start_test_db.ps1` |

Both are user-space PostgreSQL 17 clusters under `%LOCALAPPDATA%`,
bound to localhost. Neither is Neon.

## Tests

### Backend

```powershell
cd backend
venv\Scripts\python manage.py test                 # uses config.settings.test
venv\Scripts\python manage.py check
venv\Scripts\python manage.py makemigrations --check --dry-run
venv\Scripts\python manage.py export_workflow_contract --check
```

The test runner (`config/test_runner.py`) refuses any database that is not
local, blocks every outbound connection except loopback, forces the local AI
provider (no API key) and writes media to a temporary folder. A test can
therefore never reach Neon, Cloudinary or a paid AI provider.

### Frontend

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm test                                          # Vitest
npm run build
```

### Browser (Playwright)

```powershell
cd frontend
npx playwright install chromium                   # once
npx playwright test                               # desktop + mobile projects
npx playwright test --project=mobile              # phones only (Pixel 7)
npx playwright test e2e/lifecycle.spec.ts         # one spec
```

Playwright starts its own stack: the backend with `config.settings.e2e`
on 127.0.0.1:8100 (database `raqeeb_e2e` on port 5434, reset and seeded by
`manage.py e2e_reset`; network guard on; local AI) and a production build of
the frontend (`.next-e2e`) on 127.0.0.1:3100. Locally it reuses servers that
are already running; CI always starts fresh ones. Seeded users all use the
password `E2e@12345` (see `frontend/e2e/support/env.ts`).

Specs change data. To run again against fresh data with servers already up:
`cd backend; $env:DJANGO_SETTINGS_MODULE="config.settings.e2e"; venv\Scripts\python manage.py e2e_reset`.

Review tools (not tests) in `frontend/e2e/tools/`: `shot.mjs` takes a
screenshot as a given user; `sweep.mjs` renders pages at 320–1024px in
Arabic and English and reports any sideways overflow.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `connection timeout` / `the database system is starting up` on port 5434 | The test cluster stopped (it stops with the process that started it). Run `start_test_db.ps1` and wait a few seconds. |
| A browser spec fails only on a re-run | Earlier specs changed the seeded cases; run `e2e_reset`. |
| `makemigrations` hangs | It is trying the development database; set `DJANGO_SETTINGS_MODULE=config.settings.test`. |
| Git Bash rewrites `/council/...` arguments | Prefix the command with `MSYS_NO_PATHCONV=1`. |

## Operations

### Reminders

- Daily via Vercel Cron (`/api/internal/send-reminders/`, bearer
  `CRON_SECRET`). Manual run: `python manage.py send_reminders`.
- Health: Settings → Reminders (internal audit) shows the last run and
  warns when no run has succeeded for 36 hours (`/api/reminder-rules/status/`).
- Default rules for an existing municipality: `ensure_reminder_defaults`
  (preview), then `--apply`. See [reminders.md](reminders.md).

### Workflow contract

After changing statuses, stages, labels or who acts in
`apps/workflow/presentation.py`, run
`python manage.py export_workflow_contract` and commit
`frontend/lib/contract/workflow.json`. CI fails while it is stale.

### Migrations in V2

All V2 migrations are additive and reversible:

- `notifications.0002` — `ReminderRun`, `ReminderDispatch`,
  `Notification.report`.
- `notifications.0003` — index on notifications (user, sent).

Apply with the **direct** (non-pooled) Neon URL, as described in DEPLOY.md.
No data migration is required; existing reminders keep working (the engine
recognises reminders sent before V2 and does not repeat them).

### Where to look

| Question | Place |
|---|---|
| Why can't this user do X on this case? | The case's `workflow.available_actions[].blockers` (shown under the action) |
| What happened to a case and when? | Case → History (status changes, files, everything; reminders sent) |
| Did reminders run? | Settings → Reminders, or `ReminderRun` in Django admin |
| Why is a number what it is? | [metrics.md](metrics.md) |
