"""Authenticated HTTP entry for the daily reminder pass.

Vercel Cron issues GET requests with ``Authorization: Bearer $CRON_SECRET``.
The original ``manage.py send_reminders`` command is unchanged for local use.
"""
import hmac

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.services import run_reminders


def cron_secret_matches(request) -> bool:
    expected = (getattr(settings, "CRON_SECRET", None) or "").strip()
    if not expected:
        return False
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        provided = authorization[7:].strip()
    else:
        provided = request.headers.get("X-Cron-Secret", "").strip()
    if not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


@extend_schema(exclude=True)
class SendRemindersView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        if not cron_secret_matches(request):
            return Response({"detail": "Unauthorized"}, status=401)
        created = run_reminders()
        return Response({"ok": True, "created": created})
