import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .database import database_from_url

if not os.environ.get("SECRET_KEY"):
    raise ImproperlyConfigured(
        "SECRET_KEY must be set in the environment when using production "
        "settings. Refusing to start with the development fallback key."
    )
SECRET_KEY = os.environ["SECRET_KEY"]

DEBUG = False

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Serverless (Vercel): do not persist DB connections across invocations.
# Use Neon's pooled DATABASE_URL for the running app; see DEPLOY.md.
DATABASES = {
    "default": database_from_url(
        conn_max_age=0,
        ssl_require=os.environ.get("DB_SSL_REQUIRE", "True") == "True",
    )
}
