"""Signed Cloudinary upload params so browsers can send files past Vercel’s body limit."""
from __future__ import annotations

import os
import time

from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.cloudinary_storage import configure_cloudinary, resource_type_for_name
from config.settings.storage import cloudinary_enabled

PURPOSES = {
    "evidence": "evidence/%Y/%m",
    "response": "responses",
}


def cloudinary_ready() -> bool:
    return cloudinary_enabled(
        cloudinary_url=getattr(settings, "CLOUDINARY_URL", "") or os.environ.get("CLOUDINARY_URL", ""),
        cloud_name=getattr(settings, "CLOUDINARY_CLOUD_NAME", "") or os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
        api_key=getattr(settings, "CLOUDINARY_API_KEY", "") or os.environ.get("CLOUDINARY_API_KEY", ""),
        api_secret=getattr(settings, "CLOUDINARY_API_SECRET", "") or os.environ.get("CLOUDINARY_API_SECRET", ""),
    )


def max_upload_bytes(*, direct_upload: bool) -> int:
    """Respect MAX_UPLOAD_SIZE_MB (default 20). Cap only on Vercel without Cloudinary."""
    max_mb = int(getattr(settings, "MAX_UPLOAD_SIZE_MB", 20) or 20)
    limit = max_mb * 1024 * 1024
    # Vercel Functions reject bodies above ~4.5MB unless the browser uploads to Cloudinary.
    if os.environ.get("VERCEL") and not direct_upload:
        limit = min(limit, 4 * 1024 * 1024)
    return limit


class MediaSignView(APIView):
    """Return signed Cloudinary params, or {direct_upload: false} for local disk."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not cloudinary_ready():
            return Response({"direct_upload": False, "max_bytes": max_upload_bytes(direct_upload=False)})

        purpose = (request.data.get("purpose") or "evidence").strip()
        if purpose not in PURPOSES:
            return Response({"detail": "Invalid upload purpose."}, status=400)

        filename = (request.data.get("filename") or "file").strip() or "file"
        folder_tpl = PURPOSES[purpose]
        folder = timezone.now().strftime(folder_tpl) if "%Y" in folder_tpl else folder_tpl
        timestamp = int(time.time())
        params = {
            "timestamp": timestamp,
            "folder": folder,
            "use_filename": True,
            "unique_filename": True,
            "overwrite": False,
        }

        configure_cloudinary(
            cloudinary_url=getattr(settings, "CLOUDINARY_URL", "") or os.environ.get("CLOUDINARY_URL", ""),
            cloud_name=getattr(settings, "CLOUDINARY_CLOUD_NAME", "") or os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
            api_key=getattr(settings, "CLOUDINARY_API_KEY", "") or os.environ.get("CLOUDINARY_API_KEY", ""),
            api_secret=getattr(settings, "CLOUDINARY_API_SECRET", "") or os.environ.get("CLOUDINARY_API_SECRET", ""),
        )
        import cloudinary
        import cloudinary.utils

        cfg = cloudinary.config()
        if not cfg.api_secret or not cfg.api_key or not cfg.cloud_name:
            return Response({"direct_upload": False, "max_bytes": max_upload_bytes(direct_upload=False)})

        signature = cloudinary.utils.api_sign_request(params, cfg.api_secret)
        return Response(
            {
                "direct_upload": True,
                "cloud_name": cfg.cloud_name,
                "api_key": cfg.api_key,
                "timestamp": timestamp,
                "signature": signature,
                "folder": folder,
                "resource_type": resource_type_for_name(filename),
                "max_bytes": max_upload_bytes(direct_upload=True),
            }
        )
