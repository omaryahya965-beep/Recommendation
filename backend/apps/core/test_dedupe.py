"""BUG-02: the server refuses an identical create sent twice in a row."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audits.models import AuditReport
from apps.core.testing import make_world
from apps.followup.models import FollowUpReport


class DuplicateCreateTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_same_report_twice_is_refused_once(self):
        body = {"title": "Dup check", "department": self.dept.id, "engagement_type": "assurance"}
        first = self.client.post("/api/reports/", body, format="json")
        second = self.client.post("/api/reports/", body, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["code"], "duplicate_request")
        self.assertEqual(AuditReport.objects.filter(title="Dup check").count(), 1)

    def test_a_different_report_is_accepted(self):
        for title in ("One", "Two"):
            body = {"title": title, "department": self.dept.id, "engagement_type": "assurance"}
            self.assertEqual(self.client.post("/api/reports/", body, format="json").status_code, 201)

    def test_a_failed_request_can_be_sent_again(self):
        body = {"title": "Q" * 300, "department": self.dept.id, "engagement_type": "assurance"}
        self.assertEqual(self.client.post("/api/reports/", body, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/reports/", body, format="json").status_code, 400)

    def test_another_user_is_not_blocked(self):
        body = {"title": "Shared", "department": self.dept.id, "engagement_type": "assurance"}
        self.assertEqual(self.client.post("/api/reports/", body, format="json").status_code, 201)
        from apps.accounts.models import User

        other = User.objects.create_user("aud2", password="x", role=User.Role.AUDIT, municipality=self.muni)
        client2 = APIClient()
        client2.force_authenticate(other)
        self.assertEqual(client2.post("/api/reports/", body, format="json").status_code, 201)

    def test_followup_generate_twice_is_refused_once(self):
        body = {"period_start": "2026-01-01", "period_end": "2026-06-30"}
        first = self.client.post("/api/followup-reports/generate/", body, format="json")
        second = self.client.post("/api/followup-reports/generate/", body, format="json")
        self.assertLess(first.status_code, 300, first.content)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(FollowUpReport.objects.count(), 1)

    def test_same_recommendation_twice_is_refused_once(self):
        body = {"report": self.report.id, "text": "Same finding", "risk_level": "low"}
        self.assertEqual(self.client.post("/api/recommendations/", body, format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/recommendations/", body, format="json").status_code, 409)
