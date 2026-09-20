"""Login throttling, logout revocation and refresh rotation."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.organizations.models import Municipality


class LoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.muni = Municipality.objects.create(name="Throttle City")
        User.objects.create_user(
            "audit1", password="Correct@12345", role=User.Role.AUDIT,
            municipality=self.muni,
        )

    def tearDown(self):
        cache.clear()

    def _rate_limit(self):
        """The configured login rate.

        DRF binds THROTTLE_RATES as a class attribute at import time, so
        override_settings cannot change it for an already-imported throttle.
        The test therefore exercises the real configured limit.
        """
        from apps.accounts.views import LoginRateThrottle

        throttle = LoginRateThrottle()
        throttle.scope = "login"
        return throttle.parse_rate(throttle.get_rate())[0]

    def test_repeated_failed_logins_are_throttled(self):
        """Without this, the login endpoint accepts unlimited guesses."""
        limit = self._rate_limit()
        statuses = [
            self.client.post(
                "/api/auth/login/",
                {"username": "audit1", "password": "wrong"},
                format="json",
            ).status_code
            for _ in range(limit + 2)
        ]
        self.assertIn(401, statuses, "wrong passwords should be rejected")
        self.assertEqual(
            statuses[-1], 429, "guessing must stop once the limit is reached"
        )

    def test_a_correct_password_still_works(self):
        res = self.client.post(
            "/api/auth/login/",
            {"username": "audit1", "password": "Correct@12345"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertEqual(res.data["user"]["role"], "audit")


class LogoutRevocationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.muni = Municipality.objects.create(name="Logout City")
        self.user = User.objects.create_user(
            "audit2", password="Correct@12345", role=User.Role.AUDIT,
            municipality=self.muni,
        )

    def tearDown(self):
        cache.clear()

    def test_logout_blacklists_the_refresh_token(self):
        """Logout must end the session server-side, not just in the browser."""
        refresh = RefreshToken.for_user(self.user)
        self.client.force_authenticate(self.user)
        out = self.client.post(
            "/api/auth/logout/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(out.status_code, 200)
        self.assertTrue(out.data["revoked"])

        self.client.force_authenticate(None)
        reused = self.client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(reused.status_code, 401)

    def test_rotated_refresh_token_cannot_be_reused(self):
        """BLACKLIST_AFTER_ROTATION: the old token dies when it is exchanged."""
        refresh = RefreshToken.for_user(self.user)
        first = self.client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(first.status_code, 200)

        replayed = self.client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(replayed.status_code, 401)

    def test_deactivated_user_cannot_refresh(self):
        refresh = RefreshToken.for_user(self.user)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(res.status_code, 401)

    def test_logout_without_a_token_does_not_error(self):
        self.client.force_authenticate(self.user)
        res = self.client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["revoked"])
