"""Backend settings for the local browser (Playwright) suite.

Started by frontend/playwright.config.ts. Like the unit-test settings, this
can only ever use a local database and never calls a paid AI provider:

* Database: E2E_DATABASE_URL, default `raqeeb_e2e` on the isolated local test
  cluster (port 5434). `manage.py e2e_reset` creates, migrates, flushes and
  seeds it before every run; it refuses to run under any other settings.
* AI: deterministic local provider, API key blanked.
* Files: local disk under backend/.e2e-media, served by Django in DEBUG.
* Outbound network from Python code is blocked for the whole process.
"""
import os

import dj_database_url

from config.safety import (
    CLOUDINARY_ENV,
    assert_local_databases,
    install_network_guard,
)

from .dev import *  # noqa: F401,F403
from .dev import BASE_DIR, REST_FRAMEWORK

E2E_MODE = True

E2E_DATABASE_URL = os.environ.get(
    "E2E_DATABASE_URL", "postgres://postgres@localhost:5434/raqeeb_e2e"
)
DATABASES = {
    "default": dj_database_url.parse(E2E_DATABASE_URL, conn_max_age=0, ssl_require=False)
}
assert_local_databases(DATABASES)

AI_ENABLED = True
AI_PROVIDER = "local"
AI_MODEL = "heuristic-v1"
AI_API_KEY = ""
AI_EMBEDDING_MODEL = ""

for _name in CLOUDINARY_ENV:
    os.environ.pop(_name, None)
CLOUDINARY_URL = ""
CLOUDINARY_CLOUD_NAME = ""
CLOUDINARY_API_KEY = ""
CLOUDINARY_API_SECRET = ""

MEDIA_ROOT = BASE_DIR / ".e2e-media"

E2E_WEB_PORT = os.environ.get("E2E_WEB_PORT", "3100")
CORS_ALLOWED_ORIGINS = [
    f"http://localhost:{E2E_WEB_PORT}",
    f"http://127.0.0.1:{E2E_WEB_PORT}",
]
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# Many sign-ins and exports per minute are normal for a browser suite.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {"login": "1000/min", "ai": "1000/min", "export": "1000/min"},
}

CRON_SECRET = "e2e-cron-secret"

install_network_guard()
