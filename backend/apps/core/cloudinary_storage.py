"""Production media backend using the official Cloudinary Python SDK.

django-cloudinary-storage is unmaintained on PyPI (0.3.0, 2020) and still
documents DEFAULT_FILE_STORAGE. The official ``cloudinary`` package supports
Django 5.x and is what Cloudinary currently documents.

This storage is wired only from production STORAGES. Dev keeps FileSystemStorage.
"""
from __future__ import annotations

import os
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


def configure_cloudinary(
    *,
    cloudinary_url: str = "",
    cloud_name: str = "",
    api_key: str = "",
    api_secret: str = "",
) -> None:
    """Apply credentials. Prefer CLOUDINARY_URL; otherwise the three-part form.

    ``cloudinary.config(cloudinary_url=...)`` does not parse the URL. The SDK
    reads ``CLOUDINARY_URL`` from the environment when Config is constructed,
    so we set that env var and reset, or pass the three fields explicitly.
    """
    import cloudinary

    url = (cloudinary_url or "").strip()
    name = (cloud_name or "").strip()
    key = (api_key or "").strip()
    secret = (api_secret or "").strip()

    if url:
        if os.environ.get("CLOUDINARY_URL") != url:
            os.environ["CLOUDINARY_URL"] = url
            cloudinary.reset_config()
        cloudinary.config(secure=True)
        return
    if name and key and secret:
        cloudinary.config(
            cloud_name=name,
            api_key=key,
            api_secret=secret,
            secure=True,
        )
        return
    if os.environ.get("CLOUDINARY_URL") or os.environ.get("CLOUDINARY_CLOUD_NAME"):
        cloudinary.config(secure=True)


def delivery_type() -> str:
    from django.conf import settings

    return getattr(settings, "CLOUDINARY_DELIVERY_TYPE", "private") or "private"


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}


def resource_type_for_name(name: str) -> str:
    """Cloudinary resource_type for a stored filename.

    PDFs, Office docs, zip, and txt must be ``raw``. Uploading them as
    ``image`` makes Cloudinary try to decode them as pictures.
    """
    ext = Path(name.replace("\\", "/")).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    return "raw"


@deconstructible
class CloudinaryMediaStorage(Storage):
    """Default production FileField backend. Resource type is per filename."""

    def __init__(self, **_options):
        super().__init__()

    def _save(self, name, content):
        import cloudinary.uploader

        configure_cloudinary()
        name = name.replace("\\", "/")
        resource_type = resource_type_for_name(name)
        folder, filename = os.path.split(name)
        if hasattr(content, "seek"):
            content.seek(0)
        options = {
            "resource_type": resource_type,
            "type": delivery_type(),
            "use_filename": True,
            "unique_filename": True,
            "overwrite": False,
            "filename_override": filename or name,
        }
        if folder:
            options["folder"] = folder
        try:
            result = cloudinary.uploader.upload(content, timeout=40, **options)
        except Exception as exc:
            from apps.core.exceptions import StorageUnavailable

            raise StorageUnavailable(
                "Could not store the uploaded file. Try again with a smaller PDF or image."
            ) from exc
        return self._stored_name(
            result, fallback_name=name, resource_type=resource_type
        )

    def _stored_name(
        self, result: dict, *, fallback_name: str, resource_type: str
    ) -> str:
        public_id = result.get("public_id") or fallback_name
        # Raw public_ids keep the original extension; do not append format again.
        if resource_type == "raw":
            return public_id
        fmt = (result.get("format") or Path(fallback_name).suffix.lstrip(".")).lower()
        if fmt and not public_id.lower().endswith(f".{fmt}"):
            return f"{public_id}.{fmt}"
        return public_id

    def _cloudinary_public_id(self, name: str) -> str:
        name = name.replace("\\", "/")
        if resource_type_for_name(name) == "raw":
            return name
        suffix = Path(name).suffix
        if suffix:
            return name[: -len(suffix)]
        return name

    def url(self, name, attachment=False):
        """A signed download link that expires (CLOUDINARY_SIGNED_URL_SECONDS).

        Never the plain CDN URL: evidence is confidential, and a leaked link
        must stop working. Only the authorization-checked API endpoints
        call this.
        """
        import time

        import cloudinary.utils
        from django.conf import settings

        configure_cloudinary()
        name = name.replace("\\", "/")
        resource_type = resource_type_for_name(name)
        fmt = "" if resource_type == "raw" else Path(name).suffix.lstrip(".").lower()
        return cloudinary.utils.private_download_url(
            self._cloudinary_public_id(name),
            fmt,
            resource_type=resource_type,
            type=delivery_type(),
            expires_at=int(time.time()) + int(getattr(settings, "CLOUDINARY_SIGNED_URL_SECONDS", 300)),
            attachment=attachment,
        )

    def exists(self, name):
        # Collision handling is Cloudinary unique_filename. Do not HEAD the CDN.
        return False

    def delete(self, name):
        import cloudinary.uploader

        configure_cloudinary()
        cloudinary.uploader.destroy(
            self._cloudinary_public_id(name),
            resource_type=resource_type_for_name(name),
            type=delivery_type(),
            invalidate=True,
        )

    def _open(self, name, mode="rb"):
        from urllib.request import urlopen

        with urlopen(self.url(name), timeout=20) as response:
            return ContentFile(response.read(), name=name)

    def get_accessed_time(self, name):
        raise NotImplementedError("Cloudinary does not expose access time.")

    def get_created_time(self, name):
        raise NotImplementedError("Cloudinary does not expose created time.")

    def get_modified_time(self, name):
        raise NotImplementedError("Cloudinary does not expose modified time.")
