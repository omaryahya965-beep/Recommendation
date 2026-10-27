"""BUG-18 / BUG-11: every refusal carries a code the UI can translate."""
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.testing import make_world
from apps.workflow import services


class ErrorCodeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def api(self, who):
        c = APIClient()
        c.force_authenticate(self.users[who])
        return c

    def change(self, current, new, confirm):
        return self.api("emp").post(
            "/api/auth/change-password/",
            {"current_password": current, "new_password": new, "new_password_confirm": confirm},
            format="json",
        ).json()["field_codes"]

    def test_password_refusals_are_specific(self):
        self.assertEqual(self.change("wrong", "Qa!Strong#2026x", "Qa!Strong#2026x"), {"current_password": ["current_password_incorrect"]})
        self.assertEqual(self.change("x", "Qa!Strong#2026x", "Qa!Strong#2026y"), {"new_password_confirm": ["password_mismatch"]})
        self.assertIn("password_too_common", self.change("x", "password123", "password123")["new_password"])
        self.assertIn("password_too_short", self.change("x", "Ab1!", "Ab1!")["new_password"])
        self.assertIn("password_entirely_numeric", self.change("x", "12345678901", "12345678901")["new_password"])

    def test_empty_file_has_its_own_code(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        res = self.api("head").post(
            f"/api/recommendations/{self.rec.id}/respond/",
            {"decision": "disagree", "justification": "j", "attachment": SimpleUploadedFile("empty.pdf", b"")},
            format="multipart",
        )
        self.assertEqual(res.json()["field_codes"], {"attachment": ["empty"]})

    def test_followup_period_order_has_its_own_code(self):
        res = self.api("audit").post(
            "/api/followup-reports/preview/", {"period_start": "2026-06-01", "period_end": "2026-01-01"}, format="json"
        )
        self.assertEqual(res.json()["field_codes"], {"non_field_errors": ["period_order"]})
