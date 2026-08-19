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
