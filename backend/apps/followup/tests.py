from datetime import date, timedelta

from rest_framework.test import APIClient

from django.test import TestCase

from apps.followup.models import FollowUpReport
from apps.workflow.tests import make_world


class FollowUpReportApiTests(TestCase):
    def setUp(self):
        self.muni, _dept, self.users, _report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def _issue(self):
        """Release the report the way submit_report_to_department does.

        A recommendation is only "on the register" once its report has left
        draft; moving the recommendation alone would be a state the real
        workflow cannot produce.
        """
        from apps.audits.models import AuditReport

        self.rec.report.status = AuditReport.Status.PENDING_RESPONSE
        self.rec.report.save(update_fields=["status"])
        self.rec.status = self.rec.Status.PENDING_RESPONSE
        self.rec.save(update_fields=["status"])

    def test_preview_computes_without_saving(self):
        self._issue()
        preview = self.client.post(
            "/api/followup-reports/preview/",
            {"period_start": "2020-01-01", "period_end": "2030-12-31", "language": "ar"},
            format="json",
        )
        self.assertEqual(preview.status_code, 200)
        self.assertIn("snapshot", preview.data)
        self.assertIn("text", preview.data["executive_summary"])
        self.assertEqual(preview.data["snapshot"]["totals"]["total"], 1)
        self.assertIn(f"REC-{self.rec.id}", preview.data["executive_summary"]["text"])
        # A preview is throwaway: nothing lands in the archive.
        self.assertEqual(FollowUpReport.objects.count(), 0)

    def test_generate_persists_a_retrievable_report(self):
        self._issue()
        created = self.client.post(
            "/api/followup-reports/generate/",
            {"period_start": "2020-01-01", "period_end": "2030-12-31", "language": "ar"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(FollowUpReport.objects.count(), 1)
        self.assertEqual(created.data["snapshot"]["totals"]["total"], 1)
        self.assertIn("text", created.data["executive_summary"])

        listed = self.client.get("/api/followup-reports/")
        self.assertEqual(listed.data["count"], 1)

    def test_stored_snapshot_is_frozen_against_later_changes(self):
        """A report issued last quarter must not silently rewrite itself."""
        self._issue()
        created = self.client.post(
            "/api/followup-reports/generate/",
            {"period_start": "2020-01-01", "period_end": "2030-12-31", "language": "ar"},
            format="json",
        )
        self.assertEqual(created.data["snapshot"]["totals"]["total"], 1)

        # The underlying portfolio moves on after the report was issued.
        from apps.audits.models import Recommendation

        Recommendation.objects.create(
            report=self.rec.report,
            text="A finding raised after the report was generated",
            risk_level="high",
            status=Recommendation.Status.PENDING_RESPONSE,
        )
        stored = self.client.get(f"/api/followup-reports/{created.data['id']}/")
        self.assertEqual(stored.data["snapshot"]["totals"]["total"], 1)

    def test_period_start_excludes_items_closed_before_the_period(self):
        """period_start must actually constrain the result set."""
        from django.utils import timezone

        self._issue()
        self.rec.status = self.rec.Status.CLOSED
        self.rec.closed_at = timezone.now() - timedelta(days=400)
        self.rec.save(update_fields=["status", "closed_at"])

        recent = self.client.post(
            "/api/followup-reports/preview/",
            {
                "period_start": str(date.today() - timedelta(days=30)),
                "period_end": str(date.today()),
            },
            format="json",
        )
        self.assertEqual(recent.data["snapshot"]["totals"]["total"], 0)

        wide = self.client.post(
            "/api/followup-reports/preview/",
            {"period_start": "2020-01-01", "period_end": str(date.today())},
            format="json",
        )
        self.assertEqual(wide.data["snapshot"]["totals"]["total"], 1)

    def test_period_start_after_end_is_rejected(self):
        res = self.client.post(
            "/api/followup-reports/preview/",
            {"period_start": "2030-01-01", "period_end": "2020-01-01"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

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
