import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .database import database_from_url
from .storage import build_storages

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

# django-storages S3 env names (also used by R2 / Spaces / MinIO).
# Fill these in on Vercel when you have a bucket; media will not persist
# on the function filesystem without them.
AWS_STORAGE_BUCKET_NAME = os.environ.get("AWS_STORAGE_BUCKET_NAME", "")
AWS_S3_REGION_NAME = os.environ.get("AWS_S3_REGION_NAME", "") or None
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL", "") or None
AWS_S3_CUSTOM_DOMAIN = os.environ.get("AWS_S3_CUSTOM_DOMAIN", "") or None
AWS_QUERYSTRING_AUTH = os.environ.get("AWS_QUERYSTRING_AUTH", "True") == "True"
AWS_S3_FILE_OVERWRITE = False
AWS_DEFAULT_ACL = None
AWS_LOCATION = os.environ.get("AWS_LOCATION", "media")

STORAGES = build_storages(
    bucket_name=AWS_STORAGE_BUCKET_NAME,
    region_name=AWS_S3_REGION_NAME,
    endpoint_url=AWS_S3_ENDPOINT_URL,
    custom_domain=AWS_S3_CUSTOM_DOMAIN,
    querystring_auth=AWS_QUERYSTRING_AUTH,
    location=AWS_LOCATION,
)

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
