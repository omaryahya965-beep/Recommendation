"""Refuse an identical create sent twice in quick succession.

The UI guards its buttons against double clicks; this is the server-side
backstop for everything else (two tabs, a retrying client, a script). The
fingerprint is the user, the path and the request body (files by name and
size), held in the shared cache for a few seconds. A request that fails
releases it, so a corrected or retried submission is never blocked.
"""
import functools
import hashlib
import json

from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response

DUPLICATE_WINDOW_SECONDS = 10


def _fingerprint(request) -> str:
    data = {}
    for key in sorted(request.data.keys()) if hasattr(request.data, "keys") else []:
        value = request.data.get(key)
        if hasattr(value, "read") and hasattr(value, "size"):
            value = f"<file {getattr(value, 'name', '')}:{value.size}>"
        data[key] = value
    raw = json.dumps([request.user.pk, request.path, data], sort_keys=True, default=str)
    return "dedupe:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def reject_duplicates(view_method):
    @functools.wraps(view_method)
    def wrapper(self, request, *args, **kwargs):
        key = _fingerprint(request)
        if not cache.add(key, 1, timeout=DUPLICATE_WINDOW_SECONDS):
            return Response(
                {"detail": "This action was already recorded.", "code": "duplicate_request"},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            response = view_method(self, request, *args, **kwargs)
        except Exception:
            cache.delete(key)
            raise
        if response.status_code >= 400:
            cache.delete(key)
        return response

    return wrapper
