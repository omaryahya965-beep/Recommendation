from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from django.test import TestCase

from apps.accounts.models import User
from apps.organizations.models import Municipality


class TokenRefreshTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.muni = Municipality.objects.create(name="Test City")
        self.user = User.objects.create_user(
            "audit1", password="x", role=User.Role.AUDIT, municipality=self.muni
        )

    def test_refresh_issues_a_new_access_token(self):
        refresh = RefreshToken.for_user(self.user)
        response = self.client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

    def test_refresh_for_a_deleted_user_is_401_not_500(self):
        refresh = RefreshToken.for_user(self.user)
        self.user.delete()
        response = self.client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(response.status_code, 401)
