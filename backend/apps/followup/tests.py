from datetime import date

from rest_framework.test import APIClient

from django.test import TestCase

from apps.followup.models import FollowUpReport
from apps.workflow.tests import make_world


class FollowUpReportApiTests(TestCase):
    def setUp(self):
        self.muni, _dept, self.users, _report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_generate_is_session_preview_not_saved(self):
        self.rec.status = self.rec.Status.PENDING_RESPONSE
        self.rec.save(update_fields=["status"])
        created = self.client.post(
            "/api/followup-reports/generate/",
            {"period_start": "2020-01-01", "period_end": "2030-12-31", "language": "ar"},
            format="json",
        )
        self.assertEqual(created.status_code, 200)
        self.assertIn("snapshot", created.data)
        self.assertIn("executive_summary", created.data)
        self.assertIn("text", created.data["executive_summary"])
        self.assertEqual(FollowUpReport.objects.count(), 0)
        self.assertEqual(created.data["snapshot"]["totals"]["total"], 1)
        self.assertIn(f"REC-{self.rec.id}", created.data["executive_summary"]["text"])

        later = self.client.post(
            "/api/followup-reports/generate/",
            {
                "period_start": str(date.today()),
                "period_end": "2030-12-31",
                "language": "ar",
            },
            format="json",
        )
        self.assertEqual(later.status_code, 200)
        self.assertGreaterEqual(later.data["snapshot"]["totals"]["total"], 1)

        listed = self.client.get("/api/followup-reports/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["count"], 0)

    def test_council_sees_saved_archive_only(self):
        FollowUpReport.objects.create(
            municipality=self.muni,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 3, 31),
            generated_by=self.users["audit"],
            snapshot={"totals": {"total": 0, "closed": 0, "completion_rate": 0, "overdue": 0}, "items": []},
        )
        self.client.force_authenticate(self.users["council"])
        listed = self.client.get("/api/followup-reports/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["count"], 1)
        generate = self.client.post(
            "/api/followup-reports/generate/",
            {"period_start": "2026-01-01", "period_end": "2026-03-31"},
            format="json",
        )
        self.assertEqual(generate.status_code, 403)
