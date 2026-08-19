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


@deconstructible
class CloudinaryMediaStorage(Storage):
    """Upload all media as Cloudinary ``raw`` resources.

    Evidence is mostly PDFs and office documents. Uploading those as ``image``
    makes Cloudinary try to decode them as pictures and fail. Images still
    download correctly as raw files.
    """

    RESOURCE_TYPE = "raw"

    def __init__(self, **_options):
        super().__init__()

    def _save(self, name, content):
        import cloudinary.uploader

        configure_cloudinary()
        name = name.replace("\\", "/")
        folder, filename = os.path.split(name)
        if hasattr(content, "seek"):
            content.seek(0)
        options = {
            "resource_type": self.RESOURCE_TYPE,
            "use_filename": True,
            "unique_filename": True,
            "overwrite": False,
            "filename_override": filename or name,
        }
        if folder:
            options["folder"] = folder
        result = cloudinary.uploader.upload(content, **options)
        return self._stored_name(result, fallback_name=name)

    def _stored_name(self, result: dict, *, fallback_name: str) -> str:
        public_id = result.get("public_id") or fallback_name
        # Raw public_ids keep the original extension; do not append format again.
        if self.RESOURCE_TYPE == "raw":
            return public_id
        fmt = (result.get("format") or Path(fallback_name).suffix.lstrip(".")).lower()
        if fmt and not public_id.lower().endswith(f".{fmt}"):
            return f"{public_id}.{fmt}"
        return public_id

    def _cloudinary_public_id(self, name: str) -> str:
        name = name.replace("\\", "/")
        if self.RESOURCE_TYPE == "raw":
            return name
        suffix = Path(name).suffix
        if suffix:
            return name[: -len(suffix)]
        return name

    def url(self, name):
        from cloudinary import CloudinaryResource

        configure_cloudinary()
        name = name.replace("\\", "/")
        options = {"resource_type": self.RESOURCE_TYPE, "type": "upload"}
        if self.RESOURCE_TYPE != "raw":
            fmt = Path(name).suffix.lstrip(".").lower()
            if fmt:
                options["format"] = fmt
        resource = CloudinaryResource(self._cloudinary_public_id(name), **options)
        return resource.build_url(secure=True)

    def exists(self, name):
        # Collision handling is Cloudinary unique_filename. Do not HEAD the CDN.
        return False

    def delete(self, name):
        import cloudinary.uploader

        configure_cloudinary()
        cloudinary.uploader.destroy(
            self._cloudinary_public_id(name),
            resource_type=self.RESOURCE_TYPE,
            invalidate=True,
        )

    def _open(self, name, mode="rb"):
        from urllib.request import urlopen

        with urlopen(self.url(name)) as response:
            return ContentFile(response.read(), name=name)

    def get_accessed_time(self, name):
        raise NotImplementedError("Cloudinary does not expose access time.")

    def get_created_time(self, name):
        raise NotImplementedError("Cloudinary does not expose created time.")

    def get_modified_time(self, name):
        raise NotImplementedError("Cloudinary does not expose modified time.")
