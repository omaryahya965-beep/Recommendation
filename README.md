# رقيب | RAQEEB

**منصة متابعة توصيات الرقابة الداخلية — بلدية البيرة**
*Internal Audit Recommendation Follow-up Platform — Al-Bireh Municipality*

Arabic-first, fully RTL, with an English locale.

> **Naming:** **RAQEEB / رقيب** is the application. **Al-Bireh Municipality /
> بلدية البيرة** is the institution that owns it. The two are kept distinct
> throughout the code — see `frontend/lib/brand.ts`, which is the single
> source of truth for both.

## Branding assets

- **Municipality seal:** `frontend/public/images/al-bireh-logo.jpeg`, rendered by
  `MunicipalityLogo` in a circular frame. A neutral monogram is shown only if
  the file fails to load.
- **RAQEEB logo:** `frontend/public/images/brand/raqeeb-logo.webp` (green) and
  `raqeeb-logo-light.webp` (white, for dark backgrounds), used by `RaqeebWordmark`.

## Live

- **Website:** https://raqeeb-albireh.vercel.app/

## Stack

- **Backend**: Django 5 + DRF + SimpleJWT + PostgreSQL. Same code runs on
  local Postgres and on Neon in production.
- **Frontend**: Next.js (App Router, TypeScript) + Tailwind v4 + TanStack
  Query. Design system documented in `frontend/DESIGN.md`.
- **AI similarity**: pluggable embedding backend (pure-Python Arabic n-gram
  hashing by default; `sentence-transformers` auto-used when installed) that
  flags possibly-recurring recommendations for human confirmation.

## Engagement types

Internal Audit works through two engagement types, stored on
`AuditReport.engagement_type`:

| Value | تقرير | Engagement |
|-------|-------|------------|
| `assurance` | تقرير تأكيدي | Assurance report |
| `advisory` | تقرير استشاري | Advisory report |

Wording is context-sensitive in the UI: `REPORT_TYPE_LABELS` for the document
("تقرير تأكيدي"), `ENGAGEMENT_TYPE_LABELS` for the engagement itself
("مهمة تأكيدية"). The type is filterable on both reports and recommendations
(`?engagement_type=`) and is broken out in analytics and follow-up snapshots.
It does **not** alter workflow semantics.

## Roles and flow (default policy)

`audit` creates reports/recommendations → `department_head` submits the
formal response (disagreement requires justification + attachment) → audit
reviews (AUDIT_APPROVAL) → `council` ratifies the report
(COUNCIL_RATIFICATION) → the department submits the action plan (after
ratification by default; with the response only when the municipal policy
requires it) → audit reviews the plan (revision loop) → `employee` executes
steps and uploads evidence → the department head reviews the implementation
→ audit verifies (sufficient / partial / insufficient, with structured
feedback) and refers sufficient cases to the council → **the council closes
or reopens**. Every action lands in an append-only audit trail.

The nineteen statuses are grouped into ten business stages; who acts next,
the binding deadline and "overdue" are computed by one module
(`backend/apps/workflow/presentation.py`) and exported to the frontend as a
contract. Overdue is never stored: it is the **binding deadline** (the plan
date, or the deadline audit sets after a partial/insufficient verification)
passing while the **department** owns the next action — time waiting on audit
or the council is never counted against the department. See
[docs/workflow.md](docs/workflow.md).

## Local development (Windows)

A dedicated user-space PostgreSQL 17 instance runs on **port 5433**
(data in `%LOCALAPPDATA%\audit_tracker_pg`, independent of any system
Postgres service). Start it after a reboot with:

```powershell
powershell backend/scripts/start_db.ps1
```

### Backend

```powershell
cd backend
venv\Scripts\python manage.py migrate
venv\Scripts\python manage.py seed_demo   # demo users, password: Demo@12345
venv\Scripts\python manage.py runserver 8000
```

Demo users: `audit1`, `head_finance`, `head_eng`, `emp_finance1`,
`emp_finance2`, `emp_eng1`, `council1`.

API docs: http://127.0.0.1:8000/api/docs/

### Frontend

```powershell
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Reminders (idempotent — safe to run any number of times per day)

```powershell
cd backend
venv\Scripts\python manage.py send_reminders
```

Schedule daily via Windows Task Scheduler / cron. Reminder offsets are fully
configurable per municipality from the audit UI (Settings → إعدادات التذكير).

### Tests

Tests run against an isolated local PostgreSQL on **port 5434** (never Neon),
with network access blocked except loopback and the local AI provider only —
see [docs/runbook.md](docs/runbook.md#tests).

```powershell
powershell backend/scripts/start_test_db.ps1      # once per boot
cd backend
venv\Scripts\python manage.py test               # backend: unit + API
cd ..\frontend
npm run lint; npx tsc --noEmit; npm test          # frontend: lint, types, unit
npx playwright test                               # browser: desktop + phone (Pixel 7)
```

The browser suite starts its own stack (`config.settings.e2e`, database
`raqeeb_e2e`, `manage.py e2e_reset` seeds it, frontend production build on
port 3100).

## Documentation

| Document | What it covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Apps, layers, the workflow contract, frontend structure (desktop and phone) |
| [docs/workflow.md](docs/workflow.md) | Statuses, the ten stages, who acts, deadlines (W1/W2), combined closure (W4), error codes |
| [docs/metrics.md](docs/metrics.md) | Every dashboard / analytics / follow-up number and its definition |
| [docs/reminders.md](docs/reminders.md) | The reminder engine: rules, catch-up, deduplication, monitoring |
| [docs/runbook.md](docs/runbook.md) | Local setup, tests, browser suite, operations and troubleshooting |
| [docs/v3-structured-finding.md](docs/v3-structured-finding.md) | Proposal: structured finding fields (Raqeeb V3) |
| [docs/security-deferred.md](docs/security-deferred.md) | Known security work, deferred pending a separate decision |

## Deployment

The database runs on Neon (serverless PostgreSQL) in production, with the
app deployed on Vercel.

Full Vercel + Neon runbook (two projects, cron, media): **[DEPLOY.md](DEPLOY.md)**.
