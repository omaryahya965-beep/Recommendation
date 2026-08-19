import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .database import database_from_url
from .storage import build_storages, cloudinary_enabled

if not os.environ.get("SECRET_KEY"):
    raise ImproperlyConfigured(
        "SECRET_KEY must be set in the environment when using production "
        "settings. Refusing to start with the development fallback key."
    )
SECRET_KEY = os.environ["SECRET_KEY"]

DEBUG = False

# Vercel preview/production hosts (``.vercel.app`` is Django's subdomain
# wildcard). Add a custom domain via ALLOWED_HOSTS without removing the default.
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "ALLOWED_HOSTS", ".vercel.app,localhost,127.0.0.1"
    ).split(",")
    if host.strip()
]

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

# WhiteNoise after SecurityMiddleware. Vercel also collectstatic's into
# STATIC_ROOT and serves /static/ from the CDN automatically.
_middleware = list(MIDDLEWARE)
_security = _middleware.index("django.middleware.security.SecurityMiddleware")
_middleware.insert(_security + 1, "whitenoise.middleware.WhiteNoiseMiddleware")
MIDDLEWARE = _middleware

# Cloudinary media (official SDK). Prefer a single CLOUDINARY_URL; the
# three-part CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET form also works.
# Leave unset until you have an account; media will not persist on Vercel
# function disk without them.
CLOUDINARY_URL = os.environ.get("CLOUDINARY_URL", "")
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")

_use_cloudinary = cloudinary_enabled(
    cloudinary_url=CLOUDINARY_URL,
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
)
if _use_cloudinary:
    from apps.core.cloudinary_storage import configure_cloudinary

    configure_cloudinary(
        cloudinary_url=CLOUDINARY_URL,
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
    )

STORAGES = build_storages(use_cloudinary=_use_cloudinary)

# Real frontend origin(s) come from the environment — never hardcoded.
# Preview URLs on *.vercel.app are allowed by regex so they do not have to
# be listed one by one.
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://[\w.-]+\.vercel\.app$"]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CSRF_TRUSTED_ORIGINS",
        os.environ.get("CORS_ALLOWED_ORIGINS", ""),
    ).split(",")
    if origin.strip()
]
