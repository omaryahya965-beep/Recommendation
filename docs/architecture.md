# Architecture

Raqeeb is two deployables: a Django/DRF API (`backend/`) on PostgreSQL
(Neon in production) and a Next.js app (`frontend/`). Each is its own Vercel
project. Arabic is the primary language (RTL); English is a full locale.

## Backend (`backend/apps/`)

| App | Responsibility |
|---|---|
| `accounts` | Users and roles (audit, department head, employee, council), JWT auth |
| `organizations` | Municipalities, departments, workflow policy |
| `audits` | Reports and recommendations; the register API, filters, ordering, CSV export; the finding parser (`finding.py` derives title, excerpt and sections from the stored text) |
| `workflow` | The state machine (`transitions.py`), guards (`guards.py`), presentation rules (`presentation.py`), the service layer (`services/`), plans, steps, evidence, verifications, approvals, the contract export command |
| `followup` | Follow-up report snapshots, reconstructed "as of" the period end (`as_of.py`) and frozen when saved |
| `notifications` | Notifications, reminder rules, the reminder engine, runs and dispatch records, the cron endpoint (`cron.py`) |
| `core` | Audit trail, scoping (`permissions.py`), analytics, role dashboards (`dashboard.py`), error codes, storage/upload helpers, the E2E reset command |
| `ai` | Advisory AI only: summaries, plan suggestions, evidence analysis, insights, the audit assistant (`services/assistant/`: scoped read-only tools + runner) |
| `ai_similarity` | Recurrence detection (n-gram or sentence embeddings) that flags possible recurrences for human confirmation |

Layers, from the outside in:

1. **Views** (DRF) parse and authorize the request (role permission +
   `scope_recommendations` / `scope_reports`), then call a service.
2. **Services** (`workflow/services/`: reports, response, plan, execution,
   closure, recurrence, notify) perform one business step inside a
   transaction: `guards.require(...)`, `transition(...)`, side records,
   notifications. Only services change a status.
3. **Guards and transitions** decide what is allowed; **presentation**
   decides what it means (stage, who acts, binding deadline, overdue) — in
   Python for one case and in SQL (`annotate_workflow`, `overdue_q`,
   `waiting_on_q`, `my_turn_q`) for lists, dashboards and analytics.
4. **Audit trail**: every change appends an `AuditTrail` row (append-only
   at the model level); follow-up reports and the case timeline read it.

Errors carry stable codes (`core/error_codes.py`); the exception handler
adds `code` / `params` to every error response.

Files: evidence and response attachments use signed direct upload to
Cloudinary when configured (the API records the result), local media
otherwise. Evidence is viewed and downloaded through the authenticated API
endpoint (the browser fetches it with the session token into a Blob).

## Frontend (`frontend/`)

App Router pages per role: `app/audit`, `app/department`, `app/employee`,
`app/council`, plus `app/login`. All data loads on the client with TanStack
Query (`lib/hooks.ts`, policies in `lib/queryPolicy.ts`); there is no
server-side data fetching.

| Area | Contents |
|---|---|
| `lib/contract/` | `workflow.json` exported by the backend, typed accessors |
| `lib/viewmodels/` | Pure, unit-tested view models shared by desktop and phone (`caseView.ts`: stage timeline, key dates, people, default section, history filters) |
| `lib/workflow.ts`, `lib/errors.ts`, `lib/api.ts` | Presentation helpers, error-code translation, the API client (token refresh, authenticated file fetch) |
| `lib/i18n/` | `ar.ts` / `en.ts` catalogs, a live store; the locale bridge keeps `<html lang/dir>` in step after hydration |
| `components/workspace/` | The case workspace: action card + action panel (the form for the server's primary action), timeline, record sections, side rail |
| `components/mobile/` | Phone primitives (Sheet, StickyActionBar, focus trap) and the phone case screen (`case/`) |
| `components/shell/` | Desktop sidebar / tablet rail, the phone app bar and bottom tabs (`MobileChrome.tsx`), shared navigation (`navigation.ts`) |
| `components/home/`, `components/dashboard/` | Role homes built on the dashboard v2 blocks |
| `components/register/` | The register: filters, chips for link filters, saved views, phone filter sheet |

### Desktop, tablet, phone

- **Desktop (≥ 1024px)**: sidebar (collapsible). The case workspace puts its
  side rail (dates, people, context) beside the record from 1280px; below
  that, with the full sidebar open, the rail stacks under the record so the
  forms keep their width.
- **Tablet (768–1023px)**: the sidebar is an icon rail; desktop screens.
- **Phone (< 768px)**: a separate screen tree on the same data and forms —
  app bar, role bottom tabs + "More" sheet, the phone case screen (status
  hero, stage chips, step cards and step sheet, sticky primary action that
  opens the form in a sheet), filters in a sheet. The switch is
  `useIsPhone()` (`lib/useMediaQuery.ts`); pages mount after the session
  check, so the first render already has the real viewport.

`<html>` and `<body>` clip sideways overflow (`overflow-x: clip`), so a
layout that is too wide is cut off rather than scrollable. Grids therefore
start from `grid-cols-1` (a column that may shrink below its content), and
the layout checks look for cut-off elements, not only for page width
(`e2e/support/layout.ts`, `e2e/tools/sweep.mjs`).

### Language and hydration

The server renders Arabic (the saved language lives in `localStorage`).
Until the app has hydrated, every render uses that locale too; then the
locale bridge switches to the saved one (`markHydrated()` in
`lib/i18n/store.ts`). Rendering English text during hydration would make
React discard the server HTML and client-render the document, which also
drops `<html data-theme>`. Text that a component builds itself and that can
hydrate late (inside a Suspense boundary) uses `inLocale(useI18n().locale, …)`.
User content of either language (titles, findings, notes, messages) is
wrapped in `<bdi>` or `dir="auto"` so its own direction decides punctuation
and truncation.

Every form (respond, review, plan, progress, evidence, verify, closure) is
one component used by both layouts; the server's `workflow` block decides
which one is offered.

## Tests

| Layer | Where | Notes |
|---|---|---|
| Backend | `backend/apps/**/test*.py` | `SafeTestRunner`: refuses non-local databases, blocks non-loopback network, local AI only, temporary media |
| Frontend unit | `frontend/**/*.test.ts(x)` (Vitest) | View models, API client, formatting, catalogs, contract drift |
| Browser | `frontend/e2e/` (Playwright) | `desktop` project (Desktop Chrome 1440×900) and `mobile` project (Pixel 7, `e2e/mobile/`); its own seeded stack |

See [runbook.md](runbook.md) for running them.
