"""The exact URLs and response shapes the frontend depends on.

Every path here is copied from a real call site in the Next.js app. The point
is to fail loudly if an endpoint is renamed or its shape changes, rather than
discovering it as a blank panel in the browser:

  lib/analytics.ts          -> GET  /api/analytics/?months=12
  RecommendationRegister    -> GET  /api/recommendations/export/?...
  followup-reports/page.tsx -> POST /api/followup-reports/preview/
                               POST /api/followup-reports/generate/
  lib/api.ts logout()       -> POST /api/auth/logout/
  EvidenceSerializer        -> GET  /api/evidence/<id>/download/
"""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.workflow.tests import drive_to_in_progress, make_world


class FrontendContractTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_analytics_payload_matches_the_typescript_interface(self):
        res = self.client.get("/api/analytics/?months=12")
        self.assertEqual(res.status_code, 200)
        for key in (
            "generated_at",
            "totals",
            "by_status",
            "by_risk",
            "by_engagement_type",
            "by_department",
            "volume",
            "implementation",
            "recurrence",
        ):
            self.assertIn(key, res.data, f"lib/analytics.ts expects '{key}'")
        for key in (
            "total",
            "open",
            "closed",
            "overdue",
            "high_risk_open",
            "recurring_confirmed",
            "completion_rate",
            "overdue_rate",
        ):
            self.assertIn(key, res.data["totals"])

    def test_department_rows_carry_every_column_the_table_renders(self):
        res = self.client.get("/api/analytics/")
        for row in res.data["by_department"]:
            for key in (
                "department",
                "name",
                "total",
                "open",
                "closed",
                "overdue",
                "in_progress",
                "high_risk",
                "recurring",
                "execution_rate",
            ):
                self.assertIn(key, row, f"PortfolioAnalytics renders '{key}'")

    def test_export_endpoint_exists_and_streams_csv(self):
        res = self.client.get("/api/recommendations/export/?ordering=-priority_score")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        self.assertIn("attachment", res["Content-Disposition"])

    def test_followup_preview_and_generate_are_both_routed(self):
        payload = {
            "period_start": "2020-01-01",
            "period_end": "2030-12-31",
            "language": "ar",
        }
        preview = self.client.post(
            "/api/followup-reports/preview/", payload, format="json"
        )
        self.assertEqual(preview.status_code, 200)
        self.assertIn("snapshot", preview.data)
        self.assertIn("executive_summary", preview.data)

        saved = self.client.post(
            "/api/followup-reports/generate/", payload, format="json"
        )
        self.assertEqual(saved.status_code, 201)
        self.assertIn("id", saved.data)

    def test_logout_endpoint_is_routed(self):
        res = self.client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("revoked", res.data)

    def test_overdue_query_parameter_is_accepted(self):
        res = self.client.get("/api/recommendations/?overdue=true")
        self.assertEqual(res.status_code, 200)
        self.assertIn("count", res.data)

    def test_evidence_download_route_is_authorized(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        self.rec.refresh_from_db()
        self.client.force_authenticate(self.users["emp"])
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = self.client.post(
            f"/api/recommendations/{self.rec.id}/evidence/",
            {"file": SimpleUploadedFile("proof.pdf", b"%PDF-1.4 x"), "notes": "n"},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 200)
        evidence_id = upload.data["evidence_files"][0]["id"]
        file_url = upload.data["evidence_files"][0]["file_url"]
        self.assertIn(f"/api/evidence/{evidence_id}/download/", file_url)

        # The owner may download it.
        res = self.client.get(f"/api/evidence/{evidence_id}/download/")
        self.assertIn(res.status_code, (302, 200))

        # Someone outside the case may not, and is told "not found" rather
        # than "forbidden", so the record's existence is not confirmed.
        self.client.force_authenticate(self.users["other_head"])
        denied = self.client.get(f"/api/evidence/{evidence_id}/download/")
        self.assertEqual(denied.status_code, 404)


class EngagementTypeTests(TestCase):
    """Assurance vs advisory must round-trip and be filterable."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_both_engagement_types_can_be_created_and_read_back(self):
        for value in ("assurance", "advisory"):
            created = self.client.post(
                "/api/reports/",
                {
                    "department": self.dept.id,
                    "title": f"{value} engagement",
                    "engagement_type": value,
                },
                format="json",
            )
            self.assertEqual(created.status_code, 201, created.data)
            self.assertEqual(created.data["engagement_type"], value)

            detail = self.client.get(f"/api/reports/{created.data['id']}/")
            self.assertEqual(detail.data["engagement_type"], value)

    def test_reports_can_be_filtered_by_engagement_type(self):
        AuditReport.objects.create(
            municipality=self.muni,
            department=self.dept,
            title="Advisory one",
            engagement_type="advisory",
            created_by=self.users["audit"],
        )
        res = self.client.get("/api/reports/?engagement_type=advisory")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["engagement_type"], "advisory")

    def test_analytics_breaks_down_by_engagement_type(self):
        res = self.client.get("/api/analytics/")
        self.assertEqual(res.data["by_engagement_type"].get("assurance"), 1)

    def test_invalid_engagement_type_is_rejected(self):
        res = self.client.post(
            "/api/reports/",
            {
                "department": self.dept.id,
                "title": "Bad type",
                "engagement_type": "audit",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)


class RecommendationWorkflowSmokeTests(TestCase):
    """The recommendation must be creatable when the AI provider is absent."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_creation_succeeds_when_ai_analysis_raises(self):
        from unittest.mock import patch

        with patch(
            "apps.ai_similarity.service.flag_if_recurring",
            side_effect=RuntimeError("provider down"),
        ):
            res = self.client.post(
                "/api/recommendations/",
                {
                    "report": self.report.id,
                    "text": "Finding raised while the AI provider is unavailable",
                    "risk_level": "high",
                    "priority_score": 70,
                },
                format="json",
            )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(
            Recommendation.objects.filter(pk=res.data["id"]).exists(),
            "an AI failure must never cost the auditor their recommendation",
        )


class ArabicNotificationCopyTests(TestCase):
    """Arabic notification text must not contain English model labels."""

    def test_every_verification_decision_has_an_arabic_label(self):
        from apps.workflow.models import VerificationDecision
        from apps.workflow.services import _VERIFICATION_LABELS_AR

        self.assertEqual(
            set(_VERIFICATION_LABELS_AR),
            {value for value, _ in VerificationDecision.Decision.choices},
        )
        for label in _VERIFICATION_LABELS_AR.values():
            self.assertFalse(
                any("a" <= ch.lower() <= "z" for ch in label),
                f"Latin letters leaked into an Arabic label: {label!r}",
            )


class RecommendationReportTypeTests(TestCase):
    """The register/case header render the report type from the recommendation."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_list_and_detail_carry_the_reports_engagement_type(self):
        listed = self.client.get("/api/recommendations/")
        self.assertEqual(listed.data["results"][0]["engagement_type"], "assurance")
        detail = self.client.get(f"/api/recommendations/{self.rec.id}/")
        self.assertEqual(detail.data["engagement_type"], "assurance")

    def test_advisory_report_is_reflected_on_its_recommendations(self):
        self.report.engagement_type = "advisory"
        self.report.save(update_fields=["engagement_type"])
        detail = self.client.get(f"/api/recommendations/{self.rec.id}/")
        self.assertEqual(detail.data["engagement_type"], "advisory")

    def test_the_field_adds_no_queries_per_row(self):
        """report is already select_related; a per-row query would be an N+1."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        for i in range(5):
            Recommendation.objects.create(report=self.report, text=f"r{i}", risk_level="low")
        with CaptureQueriesContext(connection) as few:
            self.client.get("/api/recommendations/?page_size=2")
        for i in range(10):
            Recommendation.objects.create(report=self.report, text=f"s{i}", risk_level="low")
        with CaptureQueriesContext(connection) as many:
            self.client.get("/api/recommendations/?page_size=15")
        self.assertLessEqual(len(many), len(few) + 2)
