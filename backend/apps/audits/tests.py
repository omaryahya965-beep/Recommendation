import csv
import io
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.models import AuditTrail
from apps.core.testing import drive_to_in_progress, make_world
from apps.organizations.models import Department, Municipality

S = Recommendation.Status


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class DraftEditTests(TestCase):
    """PATCH used to answer 200 while changing nothing: the update action
    used the read-only list serializer."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = client_for(self.users["audit"])
        self.url = f"/api/recommendations/{self.rec.id}/"

    def test_patch_updates_a_draft_and_returns_the_full_case(self):
        res = self.client.patch(
            self.url,
            {"text": "Revised wording", "risk_level": "low", "priority_score": 0},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.text, "Revised wording")
        self.assertEqual(self.rec.risk_level, "low")
        self.assertEqual(self.rec.priority_score, 0)
        self.assertEqual(res.data["text"], "Revised wording")
        self.assertIn("trail", res.data)

    def test_edit_is_written_to_the_audit_trail(self):
        self.client.patch(self.url, {"risk_level": "medium"}, format="json")
        entry = AuditTrail.objects.get(recommendation=self.rec, action="recommendation_updated")
        self.assertEqual(entry.metadata["changes"]["risk_level"], {"from": "high", "to": "medium"})

    def test_unchanged_patch_writes_no_trail_entry(self):
        self.client.patch(self.url, {"risk_level": "high"}, format="json")
        self.assertFalse(
            AuditTrail.objects.filter(recommendation=self.rec, action="recommendation_updated").exists()
        )

    def test_issued_recommendation_cannot_be_edited(self):
        from apps.workflow import services

        services.submit_report_to_department(self.report, self.users["audit"])
        res = self.client.patch(self.url, {"text": "Too late"}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "draft_only")
        self.rec.refresh_from_db()
        self.assertNotEqual(self.rec.text, "Too late")

    def test_blank_text_is_rejected(self):
        res = self.client.patch(self.url, {"text": "   "}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_priority_out_of_range_is_rejected(self):
        res = self.client.patch(self.url, {"priority_score": 101}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_report_cannot_be_moved(self):
        other = AuditReport.objects.create(
            municipality=self.muni, department=self.dept, title="Other",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        self.client.patch(self.url, {"report": other.id}, format="json")
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.report_id, self.report.id)

    def test_only_audit_may_edit(self):
        res = client_for(self.users["head"]).patch(self.url, {"text": "x"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_other_municipality_cannot_see_the_draft(self):
        muni = Municipality.objects.create(name="Elsewhere")
        stranger = User.objects.create_user(
            "stranger", password="x", role=User.Role.AUDIT, municipality=muni
        )
        res = client_for(stranger).patch(self.url, {"text": "x"}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_text_change_rechecks_recurrence(self):
        self.rec.is_recurring = True
        self.rec.similarity_score = 0.9
        self.rec.save()
        with mock.patch("apps.ai_similarity.service.flag_if_recurring") as flag:
            self.client.patch(self.url, {"text": "Entirely new finding"}, format="json")
        flag.assert_called_once()
        self.rec.refresh_from_db()
        self.assertFalse(self.rec.is_recurring)
        self.assertIsNone(self.rec.similarity_score)

    def test_confirmed_recurrence_survives_an_edit(self):
        self.rec.is_recurring = True
        self.rec.recurrence_confirmed = True
        self.rec.save()
        with mock.patch("apps.ai_similarity.service.flag_if_recurring") as flag:
            self.client.patch(self.url, {"text": "Reworded"}, format="json")
        flag.assert_not_called()
        self.rec.refresh_from_db()
        self.assertTrue(self.rec.is_recurring)


class RegisterOrderingTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.rec.risk_level = "medium"
        self.rec.save()
        other = AuditReport.objects.create(
            municipality=self.muni, department=self.dept, title="Second",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        Recommendation.objects.create(report=other, text="low one", risk_level="low")
        Recommendation.objects.create(report=other, text="high one", risk_level="high")
        self.client = client_for(self.users["audit"])

    def risks(self, ordering):
        res = self.client.get(f"/api/recommendations/?ordering={ordering}")
        self.assertEqual(res.status_code, 200)
        return [row["risk_level"] for row in res.data["results"]]

    def test_descending_risk_is_high_medium_low(self):
        self.assertEqual(self.risks("-risk_level"), ["high", "medium", "low"])

    def test_ascending_risk_is_low_medium_high(self):
        self.assertEqual(self.risks("risk_level"), ["low", "medium", "high"])

    def test_risk_alias(self):
        self.assertEqual(self.risks("-risk"), ["high", "medium", "low"])

    def test_unknown_ordering_is_ignored(self):
        res = self.client.get("/api/recommendations/?ordering=password")
        self.assertEqual(res.status_code, 200)

    def test_deadline_ordering_puts_undated_cases_last(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        res = self.client.get("/api/recommendations/?ordering=target_date")
        ids = [row["id"] for row in res.data["results"]]
        self.assertEqual(ids[0], self.rec.id)

    def test_deadline_ordering_follows_the_binding_deadline(self):
        import datetime

        from django.utils import timezone

        from apps.workflow import services

        drive_to_in_progress(self.users, self.report, self.rec)  # plan due in 30 days
        urgent_report = AuditReport.objects.create(
            municipality=self.muni, department=self.dept, title="Urgent",
            engagement_type="assurance", created_by=self.users["audit"],
            response_deadline=timezone.localdate() + datetime.timedelta(days=5),
        )
        urgent = Recommendation.objects.create(report=urgent_report, text="answer soon", risk_level="low")
        services.submit_report_to_department(urgent_report, self.users["audit"])

        by_deadline = self.client.get("/api/recommendations/?ordering=deadline").data["results"]
        self.assertEqual([row["id"] for row in by_deadline[:2]], [urgent.id, self.rec.id])
        self.assertEqual(by_deadline[0]["deadline_source"], "response")
        by_plan_date = self.client.get("/api/recommendations/?ordering=target_date").data["results"]
        self.assertEqual(by_plan_date[0]["id"], self.rec.id)

    def test_waiting_ordering_lists_the_longest_wait_first(self):
        import datetime

        from django.utils import timezone

        AuditTrail.objects.create(
            user=self.users["audit"], action="status_changed", recommendation=self.rec,
            metadata={"from_status": "x", "to_status": "draft"},
        )
        AuditTrail.objects.filter(recommendation=self.rec).update(
            created_at=timezone.now() - datetime.timedelta(days=60)
        )
        Recommendation.objects.exclude(pk=self.rec.pk).update(created_at=timezone.now())
        res = self.client.get("/api/recommendations/?ordering=waiting")
        self.assertEqual(res.data["results"][0]["id"], self.rec.id)


class ExportTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = client_for(self.users["audit"])

    def rows(self):
        res = self.client.get("/api/recommendations/export/")
        self.assertEqual(res.status_code, 200)
        body = b"".join(res.streaming_content).decode("utf-8").lstrip("﻿")
        return list(csv.DictReader(io.StringIO(body)))

    def test_priority_zero_is_exported_as_zero(self):
        self.rec.priority_score = 0
        self.rec.save()
        self.assertEqual(self.rows()[0]["priority_score"], "0")

    def test_missing_values_are_blank(self):
        row = self.rows()[0]
        self.assertEqual(row["target_date"], "")
        self.assertEqual(row["closed_at"], "")


class ReportOrderingTests(TestCase):
    def test_register_lists_newest_report_first(self):
        muni, dept, users, report, rec = make_world()
        newer = AuditReport.objects.create(
            municipality=muni, department=dept, title="Newer",
            engagement_type="assurance", created_by=users["audit"],
        )
        res = client_for(users["audit"]).get("/api/reports/")
        self.assertEqual([row["id"] for row in res.data["results"]], [newer.id, report.id])


class CouncilDashboardTests(TestCase):
    def test_pending_reports_are_counted_in_one_query(self):
        muni, dept, users, report, rec = make_world()
        from apps.workflow import services

        services.submit_report_to_department(report, users["audit"])
        rec.refresh_from_db()
        services.submit_response(rec, users["head"], decision="agree")
        services.review_response(rec, users["audit"], accept=True)
        services.submit_report_to_council(report, users["audit"])
        for index in range(3):
            extra = AuditReport.objects.create(
                municipality=muni, department=Department.objects.get(name="Finance"),
                title=f"Extra {index}", engagement_type="assurance",
                created_by=users["audit"], status=AuditReport.Status.PENDING_COUNCIL,
            )
            Recommendation.objects.create(report=extra, text="x", risk_level="low")
        res = client_for(users["council"]).get("/api/dashboard/")
        queue = res.data["action_center"]["reports_pending_ratification"]
        self.assertEqual(queue["count"], 4)
        self.assertTrue(all(item["recommendations_count"] == 1 for item in queue["items"]))
