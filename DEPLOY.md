# Deployment (Vercel + Neon)

Code and config preparation for running the Django API and Next.js frontend
on Vercel, with Neon Postgres. This file is filled in as each deploy step
lands. Do not treat it as a live environment — no Vercel/Neon resources are
created from this repo.

## Neon Postgres

`dj-database-url` + `psycopg` already read `DATABASE_URL`. The same code path
works for local Postgres and Neon. Only the URL (and SSL) change.

Neon issues **two** connection strings per branch. They are not interchangeable:

| Use | Which string | How to recognize it |
|-----|----------------|---------------------|
| Running app (Vercel Functions) | **Pooled** | Host contains `-pooler` (PgBouncer), e.g. `ep-….neon.tech` → `ep-…-pooler.….neon.tech` |
| `manage.py migrate` (and other DDL) | **Direct** | Host has **no** `-pooler`. Neon/Vercel often expose this as `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` |

Set on the **backend** Vercel project:

```
DATABASE_URL=<pooled Neon URL>?sslmode=require
DB_SSL_REQUIRE=True
```

Run migrations from a machine that can reach Neon (laptop or `vercel env pull`),
pointing **only that command** at the direct URL:

```powershell
cd backend
$env:DJANGO_SETTINGS_MODULE = "config.settings.prod"
$env:DATABASE_URL = "<direct Neon URL>?sslmode=require"
$env:DB_SSL_REQUIRE = "True"
$env:SECRET_KEY = "<production secret>"
.\venv\Scripts\python manage.py migrate
```

Production settings use `CONN_MAX_AGE=0` so a serverless invocation does not
hold a pooled connection after it returns. Local `settings/dev.py` is
unchanged and still uses persistent connections (`CONN_MAX_AGE=600`).

## Vercel project layout

Create **two** Vercel projects from this Git repo (do not deploy the repo
root as a single project):

| Project | Root Directory | Framework |
|---------|----------------|-----------|
| Backend API | `backend` | Django (auto-detected from `manage.py` + `WSGI_APPLICATION`) |
| Frontend | `frontend` | Next.js |

Python version is pinned in `backend/.python-version` (3.13). Set
`DJANGO_SETTINGS_MODULE=config.settings.prod` on the backend project.
`VERCEL=1` is set automatically and makes `manage.py` default to prod as well.

`ALLOWED_HOSTS` in production defaults to `.vercel.app` (all `*.vercel.app`
hosts). When you attach a custom domain, add it to the `ALLOWED_HOSTS` env
var, comma-separated, e.g. `.vercel.app,api.example.gov`. Do not change
`settings/dev.py`.

## Static and media files

Vercel runs `collectstatic` automatically when `STATIC_ROOT` is set (it
already is). Collected files are served from the Vercel CDN at `STATIC_URL`
(`/static/`). WhiteNoise is installed so `vercel dev` and any WSGI host can
serve the same assets.

**Media** (evidence uploads, response attachments, generated follow-up
files) cannot live on the Vercel function filesystem. Production is stubbed
for S3-compatible storage via django-storages. It stays on local disk until
you set `AWS_STORAGE_BUCKET_NAME` and credentials — pick a provider first
(AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, …). The `AWS_*` names
are django-storages conventions, not an AWS-only requirement.

Required once you have a bucket:

| Env var | You provide |
|---------|-------------|
| `AWS_STORAGE_BUCKET_NAME` | Bucket name |
| `AWS_ACCESS_KEY_ID` | Access key |
| `AWS_SECRET_ACCESS_KEY` | Secret key |
| `AWS_S3_REGION_NAME` | Region (also set this when using a custom endpoint) |
| `AWS_S3_ENDPOINT_URL` | Optional. Custom API URL (R2, Spaces, MinIO). Leave unset for AWS S3 |
| `AWS_S3_CUSTOM_DOMAIN` | Optional. Public/CDN host for object URLs |
| `AWS_QUERYSTRING_AUTH` | Optional. Default `True` (signed URLs). Set `False` only for a public bucket |
| `AWS_LOCATION` | Optional. Key prefix inside the bucket. Default `media` |
