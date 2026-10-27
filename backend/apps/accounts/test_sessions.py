"""Session regressions from the 2026-10-27 QA run (BUG-05, BUG-17)."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.testing import make_world


class RefreshThrottleTests(TestCase):
    """BUG-05: other people's failed logins must not block token refresh."""

    def setUp(self):
        cache.clear()
        _, _, self.users, _, _ = make_world()
        self.client = APIClient()

    def _login(self, username="head", password="x"):
        return self.client.post("/api/auth/login/", {"username": username, "password": password}, format="json")

    def test_refresh_is_not_throttled_by_failed_logins_from_the_same_ip(self):
        tokens = self._login().json()
        for _ in range(12):
            self._login("someone", "typo")
        self.assertEqual(self._login("someone", "typo").status_code, 429)
        res = self.client.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(res.status_code, 200, res.content)


class PasswordChangeRevokesOtherSessionsTests(TestCase):
    """BUG-17: a password change ends every other session but keeps this one."""

    def setUp(self):
        cache.clear()
        _, _, self.users, _, _ = make_world()
        self.client = APIClient()

    def _login(self):
        return self.client.post("/api/auth/login/", {"username": "emp", "password": "x"}, format="json").json()

    def test_other_refresh_tokens_are_revoked_and_current_session_continues(self):
        device_a, device_b = self._login(), self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {device_a['access']}")
        res = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "x", "new_password": "Qa!Strong#2026x", "new_password_confirm": "Qa!Strong#2026x"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        fresh = res.json()
        self.assertIn("access", fresh)
        self.assertIn("refresh", fresh)
        self.client.credentials()
        for old in (device_a["refresh"], device_b["refresh"]):
            self.assertEqual(
                self.client.post("/api/auth/refresh/", {"refresh": old}, format="json").status_code, 401
            )
        self.assertEqual(
            self.client.post("/api/auth/refresh/", {"refresh": fresh["refresh"]}, format="json").status_code, 200
        )
