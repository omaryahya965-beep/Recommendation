import sys

from .base import *  # noqa: F401,F403

DEBUG = True

# Test-run only: the suite creates several users per test case, and PBKDF2 at
# production work factor dominated the runtime. This affects the test database
# exclusively — production hashing is untouched.
if "test" in sys.argv:
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

ALLOWED_HOSTS = ["*"]

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Local development and the test suite use an in-process cache: the database
# cache would otherwise carry throttle counters between tests and make them
# order-dependent. Production keeps the shared database cache (see base.py).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "raqeeb-dev",
    }
}
