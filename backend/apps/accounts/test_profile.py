from rest_framework.test import APIClient

from django.test import TestCase

from apps.accounts.models import User
from apps.organizations.models import Municipality


class ProfileUpdateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.muni = Municipality.objects.create(name="Test City")
        self.user = User.objects.create_user(
            "audit1",
            password="OldPass@123",
            role=User.Role.AUDIT,
            municipality=self.muni,
        )
        self.client.force_authenticate(self.user)

    def test_patch_updates_email_only(self):
        response = self.client.patch(
            "/api/auth/me/",
            {"email": "audit@example.com", "username": "hacked", "role": "council"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "audit@example.com")
        self.assertEqual(self.user.username, "audit1")
        self.assertEqual(self.user.role, User.Role.AUDIT)
        self.assertEqual(response.data["email"], "audit@example.com")

    def test_patch_rejects_invalid_email(self):
        response = self.client.patch(
            "/api/auth/me/", {"email": "not-an-email"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_change_password(self):
        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "OldPass@123",
                "new_password": "NewPass@456",
                "new_password_confirm": "NewPass@456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass@456"))

    def test_change_password_rejects_wrong_current(self):
        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "wrong",
                "new_password": "NewPass@456",
                "new_password_confirm": "NewPass@456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass@123"))

    def test_change_password_rejects_mismatch(self):
        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "OldPass@123",
                "new_password": "NewPass@456",
                "new_password_confirm": "OtherPass@456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unauthenticated_profile_is_401(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(
            self.client.post("/api/auth/change-password/", {}, format="json").status_code,
            401,
        )
