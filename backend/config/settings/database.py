"""Parse DATABASE_URL for local Postgres and Neon.

The same URL-driven config is used everywhere. The only difference is
connection lifetime: persistent connections (CONN_MAX_AGE > 0) are correct
for a long-lived runserver / gunicorn worker, and wrong for serverless
invocations where each request is a fresh process that must not hold a
Neon pooled slot after it returns.
"""
import os

import dj_database_url

LOCAL_DEFAULT = "postgres://postgres@localhost:5433/audit_tracker"


def database_from_url(*, conn_max_age: int, ssl_require: bool | None = None) -> dict:
    if ssl_require is None:
        ssl_require = os.environ.get("DB_SSL_REQUIRE", "False") == "True"
    config = dj_database_url.config(
        default=os.environ.get("DATABASE_URL", LOCAL_DEFAULT),
        conn_max_age=conn_max_age,
        conn_health_checks=True,
        ssl_require=ssl_require,
    )
    # Neon pooled hosts use PgBouncer in transaction mode, which cannot
    # hold server-side cursors across the pool.
    if conn_max_age == 0:
        config["DISABLE_SERVER_SIDE_CURSORS"] = True
    return config
