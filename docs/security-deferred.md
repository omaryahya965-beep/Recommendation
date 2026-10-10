# Deferred security work

**Status: documented only — not implemented.** Security hardening was
explicitly deferred during Raqeeb V2. Each item below needs a separate
decision before any change is made. V2 changed none of the areas listed
here; where V2 work touched a neighbouring area, that is noted.

Priority: **P1** fix before wider rollout · **P2** fix soon · **P3** improve.

## Authentication and session

| # | Item | Current state | Risk | Recommendation | Priority |
|---|---|---|---|---|---|
| S1 | JWT storage | Access and refresh tokens are kept in `localStorage` (`audit_tracker_auth`). | Any script injected into the app can read and replay both tokens (7-day refresh). | Move the refresh token to an `HttpOnly; Secure; SameSite` cookie set by the API, keep the short-lived access token in memory; add CSRF protection for the cookie flow. | P1 |
| S2 | Refresh race | Two requests that hit 401 together each call `/api/auth/refresh/`; with rotation + blacklist on, the second refresh uses a blacklisted token and signs the user out. | Unexpected sign-outs; not a data exposure. | Single-flight the refresh in `lib/api.ts` (share one in-flight promise). | P2 |
| S3 | Demo login | The login page offers one-click demo accounts when `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`; the password then comes from `NEXT_PUBLIC_DEMO_PASSWORD` and is compiled into the public bundle. | If enabled on a public deployment, anyone can sign in with the demo roles, and the password is visible in the JS. | Never set these on production; remove demo users from production data; consider removing the feature from production builds entirely. | P1 (verify production settings) |

## Browser and transport

| # | Item | Current state | Risk | Recommendation | Priority |
|---|---|---|---|---|---|
| S4 | Content Security Policy | No CSP header on the frontend. | XSS impact is not contained (and S1 makes it worse). | Add a CSP (script-src self + hashes/nonces for the inline locale/theme script, connect-src to the API and Cloudinary, frame-ancestors none). | P1 |
| S5 | CORS | Production allows `CORS_ALLOWED_ORIGINS` **and** any `https://*.vercel.app` origin by regex (credentials are not allowed). | Low today: the API uses bearer tokens, which browsers never attach automatically. It becomes serious once S1 moves authentication to cookies, because any Vercel-hosted site would then be a trusted origin. | Restrict the regex to this project's preview pattern, or drop it in production, before (or together with) S1. | P2 |

## Files

| # | Item | Current state | Risk | Recommendation | Priority |
|---|---|---|---|---|---|
| S6 | Raw storage URLs | Evidence (`file`) and response attachments (`attachment`) serialize the storage URL; Cloudinary delivery is public. V2 changed the **UI** to view/download evidence only through the authenticated API endpoint (Blob), but the raw URL is still in the API payload, and the response attachment is still a direct link. | Anyone with a leaked URL can fetch the file, indefinitely; no access log. | Private/authenticated Cloudinary delivery (or signed, expiring URLs) and drop raw URLs from payloads; serve the response attachment through the same authenticated endpoint. | P1 |
| S7 | File type checks | Uploads are validated by extension and size. | A file can claim a harmless extension. | Validate magic bytes (and re-encode images) server-side; consider malware scanning for Office files and archives. | P2 |
| S16 | CSV formula injection | The register CSV export (`/api/recommendations/export/`) writes user-entered text (finding text, root cause, report title, names) as-is. Found in the final V2 QA. | A cell that starts with `=`, `+`, `-` or `@` is evaluated as a formula when the file is opened in Excel or Sheets (data exfiltration via external links, misleading values). | Prefix such cells with an apostrophe (or a leading tab) in `_csv_cell` for text values; keep numbers and dates untouched; add a test. | P2 |

## Authorization scope

| # | Item | Current state | Risk | Recommendation | Priority |
|---|---|---|---|---|---|
| S8 | AI endpoints without UI | `/api/ai/recommendations/<id>/analyze|similar|risk/`, `/api/ai/analyses/<id>/review/`, `/api/ai/assistant/conversations/memory/` remain reachable; the V2 UI no longer calls them. | Unused surface; scope rules must still hold for each. | Decide per endpoint: remove, or keep with an explicit scope test. | P2 |
| S9 | Cross-scope similar text and AI context | A case's `similar_recommendation_text` (an excerpt of the matched recommendation) is returned to **every** viewer of the case, including department heads and employees, even when the match belongs to another department. Assistant tools are scoped per tool. | A department user can read an excerpt of another department's finding. | Return the excerpt only when the viewer may see the matched case (`scope_recommendations`); audit every assistant tool against the same scope; add tests per role. | P1 |
| S10 | Assistant and follow-up reports | The assistant's follow-up tool lists follow-up reports for the caller's municipality. | Same as S11 for heads. | Align with the S11 decision. | P2 |
| S11 | Follow-up report visibility | Follow-up snapshots are municipality-wide; department heads can read them through the API. V2 did **not** add a department-head follow-up page for this reason. | A head sees other departments' figures and case titles. | Decide the policy (department-filtered snapshot view, or audit/council only); then add the head page. | P2 |
| S12 | Recurrence scope | Recurrence flags compare a new recommendation with history across the municipality. | Text of other departments' findings can appear in comparisons. | Restrict what is shown to non-audit roles; keep full comparison for audit. | P3 |

## Operations

| # | Item | Current state | Risk | Recommendation | Priority |
|---|---|---|---|---|---|
| S13 | Secrets | Secrets are environment variables on Vercel (`SECRET_KEY`, `DATABASE_URL`, `CRON_SECRET`, Cloudinary, AI keys). | Rotation and access are manual; no inventory. | Keep an inventory with owners and rotation dates; rotate after staff changes. | P2 |
| S14 | Monitoring | No error tracking or alerting; the reminder engine's health is visible in-app only. | Failures (cron, uploads, 500s) go unnoticed. | Add error tracking (backend and frontend) and an alert on reminder runs and 5xx rates. | P2 |
| S15 | Per-viewer storage | Saved register views and the sidebar state are kept in `localStorage` (query strings and a flag only, no case data). | None significant; noted for completeness. | No action. | — |

## What V2 changed nearby (for context)

- Evidence view/download in the UI goes through the authenticated endpoint
  with the session token (Blob URL), never the raw storage URL (S6 remains
  for the API payload and response attachments).
- Sign-out and expired-session redirects use `location.replace`, so the
  protected page is not left in the back history.
- Tests and the browser suite cannot reach Neon, Cloudinary or a paid AI
  provider (local-only databases, network guard, local AI).
