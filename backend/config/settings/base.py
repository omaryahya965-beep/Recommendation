"""
Base settings shared by all environments.

Database selection is driven entirely by the DATABASE_URL environment
variable so the same code runs on local Postgres and on Neon.
"""
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

from .database import database_from_url

BASE_DIR = Path(__file__).resolve().parent.parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-key-change-in-production")

DEBUG = os.environ.get("DEBUG", "False") == "True"

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.organizations",
    "apps.audits",
    "apps.workflow",
    "apps.notifications",
    "apps.followup",
    "apps.ai_similarity",
    "apps.ai",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ---------------------------------------------------------------------------
# Database: single DATABASE_URL, identical code for local Postgres and Neon
# ---------------------------------------------------------------------------
DATABASES = {"default": database_from_url(conn_max_age=600)}

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Audit Recommendations Follow-up API",
    "DESCRIPTION": "Tracks implementation of internal audit recommendations in municipalities.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------------------------------------------------------------------------
# i18n / time
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "ar"
TIME_ZONE = os.environ.get("TIME_ZONE", "Asia/Gaza")
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Uploads: restrict evidence/attachment files by size and type
# ---------------------------------------------------------------------------
MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "20"))
ALLOWED_UPLOAD_EXTENSIONS = [
    ".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx",
    ".xls", ".xlsx", ".csv", ".txt", ".zip",
]

# ---------------------------------------------------------------------------
# AI similarity (existing portable embeddings; consumed by apps.ai)
# ---------------------------------------------------------------------------
# "auto": use sentence-transformers when installed, else hashing n-gram fallback.
SIMILARITY_BACKEND = os.environ.get("SIMILARITY_BACKEND", "auto")
SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "0.85"))

# ---------------------------------------------------------------------------
# AI intelligence layer (decision support only — never workflow authority)
# ---------------------------------------------------------------------------
# Provider: "local" uses deterministic, data-driven heuristics (no API key).
# "openai" uses an OpenAI-compatible Chat Completions API when AI_API_KEY is set.
# If the remote provider fails, services fall back to the local analyzer.
AI_ENABLED = os.environ.get("AI_ENABLED", "true").lower() in ("1", "true", "yes")
AI_PROVIDER = os.environ.get("AI_PROVIDER", "local").strip().lower()
AI_MODEL = os.environ.get("AI_MODEL", "heuristic-v1")
AI_EMBEDDING_MODEL = os.environ.get("AI_EMBEDDING_MODEL", "")
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_SIMILARITY_THRESHOLD = float(
    os.environ.get("AI_SIMILARITY_THRESHOLD", os.environ.get("SIMILARITY_THRESHOLD", "0.80"))
)
AI_MAX_CONTEXT_ITEMS = int(os.environ.get("AI_MAX_CONTEXT_ITEMS", "10"))
AI_MAX_OUTPUT_TOKENS = int(os.environ.get("AI_MAX_OUTPUT_TOKENS", "2000"))
AI_TEMPERATURE = float(os.environ.get("AI_TEMPERATURE", "0.2"))
AI_TIMEOUT_SECONDS = int(os.environ.get("AI_TIMEOUT_SECONDS", "30"))
AI_MAX_EXTRACT_CHARS = int(os.environ.get("AI_MAX_EXTRACT_CHARS", "20000"))

CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
