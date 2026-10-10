"""Settings for the automated test suite.

`manage.py test` selects this module by default. It never talks to a shared
database or a paid service:

* Database: TEST_DATABASE_URL, defaulting to the dedicated local test cluster
  started by `scripts/start_test_db.ps1` (port 5434). Your development
  database on 5433 and Neon are never used. Django creates and drops its own
  `test_*` database inside that server.
* AI: the deterministic local provider, with the API key blanked, whatever
  the developer's `.env` says.
* Files: local disk only (config.test_runner moves MEDIA_ROOT to a temp dir).

config.test_runner.SafeTestRunner re-checks all of this at start-up and also
blocks outbound network connections.
"""
import os

import dj_database_url

from .dev import *  # noqa: F401,F403

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgres://postgres@localhost:5434/raqeeb_test"
)
DATABASES = {
    "default": dj_database_url.parse(TEST_DATABASE_URL, conn_max_age=0, ssl_require=False)
}

AI_ENABLED = True
AI_PROVIDER = "local"
AI_MODEL = "heuristic-v1"
AI_API_KEY = ""
AI_EMBEDDING_MODEL = ""

CLOUDINARY_URL = ""
CLOUDINARY_CLOUD_NAME = ""
CLOUDINARY_API_KEY = ""
CLOUDINARY_API_SECRET = ""

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CRON_SECRET = "test-cron-secret"

TEST_RUNNER = "config.test_runner.SafeTestRunner"
