"""Static and media storage backends for production.

Static files: WhiteNoise (and Vercel's CDN after collectstatic).
Media files: local disk by default (does not persist on serverless). When
AWS_STORAGE_BUCKET_NAME is set, switch to django-storages S3, which also
speaks R2, Spaces, MinIO, and other S3-compatible APIs via AWS_S3_ENDPOINT_URL.

No bucket is assumed. Leave the env vars unset until you have a provider.
"""


def build_storages(
    *,
    bucket_name: str = "",
    region_name: str | None = None,
    endpoint_url: str | None = None,
    custom_domain: str | None = None,
    querystring_auth: bool = True,
    location: str = "media",
) -> dict:
    storages = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }
    name = (bucket_name or "").strip()
    if not name:
        return storages

    options = {
        "bucket_name": name,
        "file_overwrite": False,
        "default_acl": None,
        "querystring_auth": querystring_auth,
        "location": location,
        "object_parameters": {"CacheControl": "public, max-age=86400"},
    }
    if region_name:
        options["region_name"] = region_name
    if endpoint_url:
        options["endpoint_url"] = endpoint_url
    if custom_domain:
        options["custom_domain"] = custom_domain
    storages["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": options,
    }
    return storages
