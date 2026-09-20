"""Verification of browser-uploaded files before they are attached to a record.

Large evidence files are uploaded straight from the browser to Cloudinary so
they bypass Vercel's ~4.5MB request body limit. The browser then POSTs only the
resulting storage key (`stored_name`) to the API.

That key used to be trusted after a prefix check, which meant a caller could
attach *any* object under `evidence/` or `responses/` — including another
municipality's evidence — simply by naming it, and neither the size limit nor
the extension allow-list applied to anything uploaded this way.

Two things close that hole:

1. `signed_upload_tags` stamps the requesting user and municipality into the
   signed upload parameters. Cloudinary rejects the upload if the client edits
   them, because they are part of the signature.
2. `claim_uploaded_file` re-reads the object from Cloudinary's Admin API before
   it is attached and confirms it exists, sits in the expected folder, carries
   this user's tag, is an allowed type, and is within the size limit.

A key that fails any of those checks is refused rather than attached.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from django.conf import settings

from apps.core.cloudinary_storage import configure_cloudinary, resource_type_for_name
from apps.core.exceptions import WorkflowError

logger = logging.getLogger(__name__)

# Folder prefix each purpose is allowed to write to and claim from.
PURPOSE_PREFIXES = {
    "evidence": "evidence/",
    "response": "responses/",
}


def owner_tag(user) -> str:
    return f"uid_{user.id}"


def municipality_tag(user) -> str:
    return f"muni_{getattr(user, 'municipality_id', None) or 0}"


def signed_upload_tags(user) -> str:
    """Tags bound into the upload signature, used later to prove ownership."""
    return f"{owner_tag(user)},{municipality_tag(user)}"


def allowed_formats_param() -> str:
    """Cloudinary-side extension allow-list, mirroring ALLOWED_UPLOAD_EXTENSIONS."""
    return ",".join(
        ext.lstrip(".") for ext in settings.ALLOWED_UPLOAD_EXTENSIONS
    )


def _max_bytes() -> int:
    return int(getattr(settings, "MAX_UPLOAD_SIZE_MB", 20) or 20) * 1024 * 1024


def _extension_of(stored_name: str) -> str:
    return Path(stored_name.replace("\\", "/")).suffix.lower()


def claim_uploaded_file(stored_name: str, *, purpose: str, user) -> str:
    """Validate a client-supplied storage key and return it, or raise.

    Raises WorkflowError (HTTP 409) with a user-facing message; the detailed
    reason is logged rather than returned, so probing the endpoint does not
    reveal whether some other tenant's object exists.
    """
    name = (stored_name or "").replace("\\", "/").lstrip("/")
    prefix = PURPOSE_PREFIXES.get(purpose)
    if prefix is None:
        raise WorkflowError("Unknown upload purpose.", code="invalid_upload")

    if not name or ".." in name or not name.startswith(prefix):
        raise WorkflowError(
            "This file reference is not valid.", code="invalid_upload"
        )

    # Extension allow-list. Raw Cloudinary public_ids keep their extension;
    # image public_ids get one appended by the client helper.
    extension = _extension_of(name)
    if extension not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise WorkflowError(
            f"File type '{extension or 'unknown'}' is not allowed.",
            code="invalid_upload",
        )

    from apps.core.media_views import cloudinary_ready

    if not cloudinary_ready():
        # Without Cloudinary there is no direct-upload path, so a stored_name
        # can only be an attempt to reference a file the server never received.
        raise WorkflowError(
            "Direct uploads are not available; send the file with the request.",
            code="invalid_upload",
        )

    resource = _fetch_resource(name)
    if resource is None:
        raise WorkflowError(
            "The uploaded file could not be found. Please upload it again.",
            code="invalid_upload",
        )

    tags = set(resource.get("tags") or [])
    if owner_tag(user) not in tags:
        logger.warning(
            "upload_claim_rejected_owner name=%s claimed_by=%s", name, user.id
        )
        raise WorkflowError(
            "This file reference is not valid.", code="invalid_upload"
        )

    size = int(resource.get("bytes") or 0)
    if size > _max_bytes():
        raise WorkflowError(
            f"File exceeds the maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
            code="invalid_upload",
        )

    return name


def _fetch_resource(name: str) -> dict | None:
    """Read the object's metadata from Cloudinary, or None if unavailable."""
    import cloudinary.api

    configure_cloudinary(
        cloudinary_url=getattr(settings, "CLOUDINARY_URL", "")
        or os.environ.get("CLOUDINARY_URL", ""),
        cloud_name=getattr(settings, "CLOUDINARY_CLOUD_NAME", "")
        or os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
        api_key=getattr(settings, "CLOUDINARY_API_KEY", "")
        or os.environ.get("CLOUDINARY_API_KEY", ""),
        api_secret=getattr(settings, "CLOUDINARY_API_SECRET", "")
        or os.environ.get("CLOUDINARY_API_SECRET", ""),
    )
    resource_type = resource_type_for_name(name)
    public_id = name
    if resource_type == "image":
        suffix = Path(name).suffix
        if suffix:
            public_id = name[: -len(suffix)]
    try:
        return cloudinary.api.resource(
            public_id, resource_type=resource_type, tags=True
        )
    except Exception:
        logger.warning("upload_claim_lookup_failed name=%s", name, exc_info=True)
        return None
