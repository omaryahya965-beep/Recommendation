# Deployment (Vercel + Neon)

Code and config preparation only. This repo does **not** create Vercel or Neon
resources. Two Vercel projects are required; do not deploy the repository
root as a single app.

| Project | Root Directory | Framework detection |
|---------|----------------|---------------------|
| Backend API | `backend` | Django via `manage.py` + `WSGI_APPLICATION` → `config.wsgi.application` |
| Frontend | `frontend` | Next.js |

Python is pinned in `backend/.python-version` (**3.13**). Vercel runs
`collectstatic` automatically because `STATIC_ROOT` is set. Function timeout
is 60s (`backend/vercel.json`).

---

## What you must do by hand

1. Create a Neon project (or attach the Vercel Neon integration).
2. Create two Vercel projects pointing at this Git repo with the root
   directories above.
3. Fill in every **you provide** variable in the tables below.
4. Run `manage.py migrate` against Neon's **direct** (non-pooler) URL.
5. Deploy backend, then frontend (frontend needs the live API origin).
6. Put the live frontend origin into backend `CORS_ALLOWED_ORIGINS`.
7. Create a Cloudinary account and set media credentials on the backend
   project before relying on evidence uploads in production.

`settings/dev.py` is unchanged. Local `manage.py` still uses it unless
`VERCEL=1` or `DJANGO_SETTINGS_MODULE` is set.

---

## Neon Postgres

`dj-database-url` + `psycopg` already read `DATABASE_URL`. The same code path
works for local Postgres and Neon. Only the URL (and SSL) change.

Neon issues **two** connection strings per branch. They are not interchangeable:

| Use | Which string | How to recognize it |
|-----|----------------|---------------------|
| Running app (Vercel Functions) | **Pooled** | Host contains `-pooler` |
| `manage.py migrate` (and other DDL) | **Direct** | Host has **no** `-pooler`. Often `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` |

Production uses `CONN_MAX_AGE=0` so a serverless invocation does not hold a
pooled slot after it returns. Local still uses `CONN_MAX_AGE=600`.

Migrate from a machine that can reach Neon:

```powershell
cd backend
$env:DJANGO_SETTINGS_MODULE = "config.settings.prod"
$env:DATABASE_URL = "<direct Neon URL>?sslmode=require"
$env:DB_SSL_REQUIRE = "True"
$env:SECRET_KEY = "<production secret>"
.\venv\Scripts\python manage.py migrate
```

---

## Environment variables — backend Vercel project

Names are exactly what the Django settings read.

### You provide (required)

| Name | Description |
|------|-------------|
| `SECRET_KEY` | Django secret. Required; production refuses to start without it. Generate a long random value. |
| `DATABASE_URL` | Neon **pooled** URL (`-pooler` host) with `sslmode=require`. If you use the Vercel Neon integration this is often injected for you — still confirm it is the pooled string. |
| `DB_SSL_REQUIRE` | Set to `True`. |
| `DJANGO_SETTINGS_MODULE` | Set to `config.settings.prod`. (`VERCEL=1` also makes `manage.py` default to prod.) |
| `CORS_ALLOWED_ORIGINS` | Exact frontend origin(s), comma-separated, **https**, no trailing slash. Example: `https://your-app.vercel.app`. Custom domains belong here. |
| `CRON_SECRET` | Random string, ≥16 characters. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/internal/send-reminders/`. |

### You provide when you have them (not optional for a real launch)

| Name | Description |
|------|-------------|
| `ALLOWED_HOSTS` | Defaults to `.vercel.app,localhost,127.0.0.1`. Add your API custom domain: `.vercel.app,api.example.gov`. |
| `CSRF_TRUSTED_ORIGINS` | Defaults to the same list as `CORS_ALLOWED_ORIGINS`. Set only if you need a different set (must include `https://`). |
| `AI_PROVIDER` | `local` (no key) or `openai`. |
| `AI_API_KEY` | Required for `AI_PROVIDER=openai`. **Never** put this on the frontend project. |
| `AI_MODEL` | Chat model id when using OpenAI, e.g. `gpt-4o-mini`. |
| `AI_BASE_URL` | Default `https://api.openai.com/v1`. |
| `AI_ENABLED` | Default `true`. |
| `TIME_ZONE` | Default `Asia/Gaza`. |
| `MAX_UPLOAD_SIZE_MB` | Default `20`. |

### Media — Cloudinary (you provide after creating an account)

Local disk **does not persist** on Vercel. Leave these unset until you have a
Cloudinary cloud; then set **either** `CLOUDINARY_URL` **or** the three
`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
variables. The official Cloudinary Python SDK reads both forms. Prefer the
single `CLOUDINARY_URL` value from the Cloudinary dashboard.

A free Cloudinary account is enough to start. The Free plan is currently
**25 credits per month** (credits are shared across storage, bandwidth, and
transformations — roughly 1 credit = 1 GB storage or 1 GB bandwidth or 1,000
transformations). Confirm [Cloudinary's current free tier](https://cloudinary.com/pricing)
before relying on this in production; limits change.

PDFs and other non-image evidence upload as Cloudinary `raw` resources, not
as images. Size and type are still enforced by `MAX_UPLOAD_SIZE_MB` and
`ALLOWED_UPLOAD_EXTENSIONS` before anything is sent to Cloudinary.

| Name | Required? | Description |
|------|-----------|-------------|
| `CLOUDINARY_URL` | Yes, unless using the three-part form | `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `CLOUDINARY_CLOUD_NAME` | Yes, if not using `CLOUDINARY_URL` | Cloud name from the dashboard |
| `CLOUDINARY_API_KEY` | Yes, if not using `CLOUDINARY_URL` | API key |
| `CLOUDINARY_API_SECRET` | Yes, if not using `CLOUDINARY_URL` | API secret |

Do not put Cloudinary secrets on the frontend Vercel project.

### Generated for you (do not invent values)

| Name | Who sets it | Description |
|------|-------------|-------------|
| `VERCEL` | Vercel | `1` on Vercel builds/runtime. Switches `manage.py` to prod settings. |
| `VERCEL_URL` | Vercel | Deployment host without scheme. Not read by this app (ALLOWED_HOSTS uses `.vercel.app`). |
| `VERCEL_ENV` | Vercel | `production` / `preview` / `development`. |
| `DATABASE_URL` | Neon integration, if attached | Prefer the **pooled** URL for the running app. |
| `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING` | Neon / Vercel Neon | Direct URL for `migrate` only. **Not** read by Django unless you copy it into `DATABASE_URL` for that command. |

Preview frontend URLs on `*.vercel.app` are allowed by CORS regex. A custom
frontend domain is **not** — it must be in `CORS_ALLOWED_ORIGINS`.

---

## Environment variables — frontend Vercel project

| Name | Who | Description |
|------|-----|-------------|
| `NEXT_PUBLIC_API_URL` | **You provide** | Backend origin, no trailing slash, e.g. `https://your-api.vercel.app`. Inlined at **build** time. The Vercel build fails if this is missing. Locally it defaults to `http://127.0.0.1:8000`. |
| `VERCEL` | Vercel | Set automatically. Used to refuse a localhost API fallback. |
| `NODE_ENV` | Vercel / Next.js | `production` on deploy. |

Do not add `AI_API_KEY`, `SECRET_KEY`, `DATABASE_URL`, `CRON_SECRET`, or
Cloudinary credentials to the frontend project.

---

## Daily reminders

`python manage.py send_reminders` is unchanged for local/manual use.

Vercel Cron (`backend/vercel.json`) **GET**s
`/api/internal/send-reminders/` at `0 4 * * *` (04:00 **UTC** daily ≈ 06:00
or 07:00 `Asia/Gaza`). Hobby plans allow one run per day.

The endpoint returns 401 unless `Authorization: Bearer <CRON_SECRET>` matches.
It is never public. The job is idempotent.

---

## Static files

Vercel collects static files at build (`STATIC_ROOT` is `backend/staticfiles`)
and serves `/static/` from the CDN (admin, DRF browsable API, Spectacular).
WhiteNoise is installed for `vercel dev` and any WSGI host.

---

## Suggested order

1. Neon database + pooled/direct URLs.
2. Backend Vercel project env (required table) + deploy.
3. `migrate` on the **direct** URL.
4. Frontend Vercel project: `NEXT_PUBLIC_API_URL` = backend origin + deploy.
5. Set backend `CORS_ALLOWED_ORIGINS` to the frontend origin; redeploy backend
   if the value was empty on first deploy.
6. Provision Cloudinary; set `CLOUDINARY_URL` (or the three-part vars);
   redeploy backend.
7. Confirm Cron in the Vercel dashboard (production only) and that
   `CRON_SECRET` is set.
