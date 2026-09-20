# رقيب | RAQEEB

**منصة متابعة توصيات الرقابة الداخلية — بلدية البيرة**
*Internal Audit Recommendation Follow-up Platform — Al-Bireh Municipality*

Arabic-first, fully RTL, with an English locale.

> **Naming:** **RAQEEB / رقيب** is the application. **Al-Bireh Municipality /
> بلدية البيرة** is the institution that owns it. The two are kept distinct
> throughout the code — see `frontend/lib/brand.ts`, which is the single
> source of truth for both.

## Municipality logo

The official artwork is **not** committed to this repository. Place the
supplied file at:

```
frontend/public/images/al-bireh-logo.png
```

`MunicipalityLogo` renders it at its natural aspect ratio (height is set,
width follows) and never recolors, crops or redraws it. Until the file is
added, a neutral monogram is shown in its place — deliberately not an
imitation of the seal.

## Live

- **Website:** https://recommendation-frontend-theta.vercel.app/

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
reviews (AUDIT_APPROVAL) → `council` ratifies (COUNCIL_RATIFICATION — the
only event that sets the reminder anchor date) → department submits the
action plan (after ratification by default; with the response only when the
municipal policy requires it) → audit reviews the plan (revision loop) →
`employee` executes steps and uploads evidence → audit verifies
(sufficient/partial/insufficient with structured feedback). Closure happens
**only** through audit verification. Every action lands in an append-only
audit trail. "Overdue" is always computed from the plan target date, never
stored.

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

```powershell
cd backend
venv\Scripts\python manage.py test apps          # unit + API tests
venv\Scripts\python scripts\e2e_scenario.py      # live HTTP end-to-end (server must run)
```

## Deployment

The database runs on Neon (serverless PostgreSQL) in production, with the
app deployed on Vercel.

Full Vercel + Neon runbook (two projects, cron, media): **[DEPLOY.md](DEPLOY.md)**.
