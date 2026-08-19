"""Static and media storage backends for production.

Static files: WhiteNoise (and Vercel's CDN after collectstatic).
Media files: local disk by default (does not persist on serverless). When
Cloudinary credentials are set, switch to the official Cloudinary SDK
storage. Dev settings never call this module's Cloudinary branch.

No cloud is assumed. Leave the env vars unset until you have an account.
"""


def cloudinary_enabled(
    *,
    cloudinary_url: str = "",
    cloud_name: str = "",
    api_key: str = "",
    api_secret: str = "",
) -> bool:
    if (cloudinary_url or "").strip():
        return True
    return bool(
        (cloud_name or "").strip()
        and (api_key or "").strip()
        and (api_secret or "").strip()
    )


def build_storages(*, use_cloudinary: bool = False) -> dict:
    storages = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }
    if not use_cloudinary:
        return storages
    storages["default"] = {
        "BACKEND": "apps.core.cloudinary_storage.CloudinaryMediaStorage",
    }
    return storages
