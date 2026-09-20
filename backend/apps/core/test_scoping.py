"""Confidentiality of unissued audit work, and correctness of the filters.

Internal audit drafts findings before releasing them. Until the report leaves
draft, nobody outside the audit unit may see it — not the audited department,
not the assigned employee, not the council. These tests pin that down, along
with the register filters whose counts the dashboard links depend on.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.workflow.models import ActionPlan
from apps.workflow.tests import make_world


class DraftConfidentialityTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()

    def _list_ids(self, user, url="/api/recommendations/"):
        self.client.force_authenticate(user)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        results = res.data["results"] if "results" in res.data else res.data
        return {row["id"] for row in results}

    def test_audit_sees_its_own_drafts(self):
        self.assertIn(self.rec.id, self._list_ids(self.users["audit"]))

    def test_department_head_cannot_see_a_draft(self):
        self.assertNotIn(self.rec.id, self._list_ids(self.users["head"]))

    def test_council_cannot_see_a_draft(self):
        self.assertNotIn(self.rec.id, self._list_ids(self.users["council"]))

    def test_draft_report_is_hidden_from_department_head(self):
        self.client.force_authenticate(self.users["head"])
        listed = self.client.get("/api/reports/")
        self.assertNotIn(
            self.report.id, {row["id"] for row in listed.data["results"]}
        )
        detail = self.client.get(f"/api/reports/{self.report.id}/")
        self.assertEqual(detail.status_code, 404)

    def test_head_sees_the_recommendation_once_it_is_issued(self):
        self.client.force_authenticate(self.users["audit"])
        res = self.client.post(
            f"/api/reports/{self.report.id}/submit-to-department/", {}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn(self.rec.id, self._list_ids(self.users["head"]))

    def test_employee_cannot_see_a_colleagues_recommendation_via_report_detail(self):
        """The nested report serializer used to return every recommendation."""
        self.client.force_authenticate(self.users["audit"])
        self.client.post(
            f"/api/reports/{self.report.id}/submit-to-department/", {}, format="json"
        )
        # A second issued recommendation, assigned to nobody.
        other = Recommendation.objects.create(
            report=self.report,
            text="A finding assigned to a different colleague",
            risk_level="low",
            status=Recommendation.Status.PENDING_RESPONSE,
        )
        ActionPlan.objects.create(
            recommendation=self.rec,
            responsible_employee=self.users["emp"],
            submitted_by=self.users["head"],
            target_date=timezone.localdate(),
        )

        self.client.force_authenticate(self.users["emp"])
        detail = self.client.get(f"/api/reports/{self.report.id}/")
        self.assertEqual(detail.status_code, 200)
        visible = {row["id"] for row in detail.data["recommendations"]}
        self.assertIn(self.rec.id, visible)
        self.assertNotIn(other.id, visible)


class OverdueFilterTests(TestCase):
    """The dashboard links to ?overdue=1 and shows a count beside it."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.report.status = AuditReport.Status.RATIFIED
        self.report.save(update_fields=["status"])
        self.rec.status = Recommendation.Status.IN_PROGRESS
        self.rec.save(update_fields=["status"])
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def _plan(self, days):
        ActionPlan.objects.create(
            recommendation=self.rec,
            responsible_employee=self.users["emp"],
            submitted_by=self.users["head"],
            target_date=timezone.localdate() + timedelta(days=days),
        )

    def test_past_deadline_is_returned_with_a_correct_count(self):
        self._plan(-3)
        res = self.client.get("/api/recommendations/?overdue=true")
        self.assertEqual(res.data["count"], 1)
        self.assertTrue(res.data["results"][0]["overdue"])

    def test_future_deadline_is_not_overdue(self):
        self._plan(10)
        res = self.client.get("/api/recommendations/?overdue=true")
        self.assertEqual(res.data["count"], 0)

    def test_closed_case_is_never_overdue(self):
        self._plan(-30)
        self.rec.status = Recommendation.Status.CLOSED
        self.rec.save(update_fields=["status"])
        res = self.client.get("/api/recommendations/?overdue=true")
        self.assertEqual(res.data["count"], 0)

    def test_filter_agrees_with_the_serialized_badge(self):
        """A row returned by ?overdue=true must render as overdue."""
        self._plan(-1)
        res = self.client.get("/api/recommendations/?overdue=true")
        for row in res.data["results"]:
            self.assertTrue(row["overdue"])

    def test_engagement_type_filter(self):
        res = self.client.get("/api/recommendations/?engagement_type=assurance")
        self.assertEqual(res.data["count"], 1)
        res = self.client.get("/api/recommendations/?engagement_type=advisory")
        self.assertEqual(res.data["count"], 0)


class PriorityScoreValidationTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def _create(self, score):
        return self.client.post(
            "/api/recommendations/",
            {
                "report": self.report.id,
                "text": "A new finding",
                "risk_level": "medium",
                "priority_score": score,
            },
            format="json",
        )

    def test_rejects_scores_above_100(self):
        self.assertEqual(self._create(101).status_code, 400)

    def test_rejects_negative_scores(self):
        self.assertEqual(self._create(-5).status_code, 400)

    def test_accepts_the_boundaries(self):
        self.assertEqual(self._create(0).status_code, 201)
        self.assertEqual(self._create(100).status_code, 201)


class ExportTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()

    def _csv(self, user, query=""):
        self.client.force_authenticate(user)
        res = self.client.get(f"/api/recommendations/export/{query}")
        self.assertEqual(res.status_code, 200)
        return b"".join(res.streaming_content).decode("utf-8")

    def test_export_starts_with_a_utf8_bom_for_excel(self):
        body = self._csv(self.users["audit"])
        self.assertTrue(body.startswith("﻿"))

    def test_export_respects_scoping(self):
        """A draft must not leak through the export path either."""
        body = self._csv(self.users["head"])
        self.assertNotIn("Segregate cash handling duties", body)

    def test_export_applies_the_same_filters_as_the_list(self):
        body = self._csv(self.users["audit"], "?risk_level=low")
        self.assertNotIn("Segregate cash handling duties", body)
        body = self._csv(self.users["audit"], "?risk_level=high")
        self.assertIn("Segregate cash handling duties", body)


class AnalyticsEndpointTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.report.status = AuditReport.Status.RATIFIED
        self.report.save(update_fields=["status"])
        self.rec.status = Recommendation.Status.IN_PROGRESS
        self.rec.save(update_fields=["status"])
        self.client = APIClient()

    def test_returns_aggregates_without_shipping_the_rows(self):
        self.client.force_authenticate(self.users["audit"])
        res = self.client.get("/api/analytics/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["totals"]["total"], 1)
        self.assertEqual(res.data["totals"]["open"], 1)
        self.assertIn("by_department", res.data)
        self.assertIn("by_engagement_type", res.data)
        # The payload is a summary: no recommendation text travels with it.
        self.assertNotIn("items", res.data)

    def test_scoped_per_role(self):
        self.client.force_authenticate(self.users["emp"])
        res = self.client.get("/api/analytics/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["totals"]["total"], 0)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/analytics/").status_code, 401)
