from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.workflow.tests import make_world


class InsightsAndSummaryTests(TestCase):
    def setUp(self):
        from apps.audits.models import AuditReport

        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        # Issue the report as submit_report_to_department would. Non-audit
        # roles cannot see recommendations that still sit in a draft report,
        # so leaving it in draft would hide it from the employee-scoped tests.
        self.report.status = AuditReport.Status.PENDING_RESPONSE
        self.report.save(update_fields=["status"])
        self.rec.status = Recommendation.Status.PENDING_RESPONSE
        self.rec.save(update_fields=["status"])
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_dashboard_insights_use_live_counts(self):
        res = self.client.get("/api/ai/dashboard/insights/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["available"])
        self.assertEqual(res.data["cards"]["high_risk"]["count"], 1)
        self.assertTrue(res.data["narratives"])
        joined = " ".join(res.data["narratives"])
        self.assertIn("1", joined)

    def test_department_head_does_not_see_other_dept(self):
        from apps.audits.models import AuditReport, Recommendation
        eng = self.users["other_head"].department
        other_report = AuditReport.objects.create(
            municipality=self.muni, department=eng, title="Eng",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        Recommendation.objects.create(report=other_report, text="Engineering only", risk_level="high")
        self.client.force_authenticate(self.users["head"])
        res = self.client.get("/api/ai/dashboard/insights/")
        texts = " ".join(
            item["text"] for bucket in res.data["cards"].values() for item in bucket["items"]
        )
        self.assertNotIn("Engineering only", texts)

    def test_summary_municipality_forbidden_for_employee(self):
        self.client.force_authenticate(self.users["emp"])
        res = self.client.post("/api/ai/summaries/", {"scope": "municipality", "language": "en"})
        self.assertEqual(res.status_code, 403)

    def test_summary_recommendation(self):
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "recommendation", "recommendation_id": self.rec.id, "language": "en"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        body = output["body"]
        self.assertIn(f"REC-{self.rec.id}", body)
        self.assertIn("Segregate", body)
        self.assertIn("resolve", body.lower())
        self.assertEqual(output["stats"]["total"], 1)
        self.assertEqual(output["stats"]["reference"], f"REC-{self.rec.id}")

    def test_summary_report(self):
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "report", "report_id": self.report.id, "language": "en"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertEqual(output["stats"]["total"], 1)

    def test_summary_department(self):
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "department", "department_id": self.dept.id, "language": "ar"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertEqual(output["stats"]["total"], 1)

    def test_summary_municipality(self):
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "municipality", "language": "en"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertEqual(output["stats"]["total"], 1)

    def test_summary_recommendation_list(self):
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "recommendation_list", "status": self.rec.status, "language": "en"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertEqual(output["stats"]["total"], 1)

    def test_summary_council_queue(self):
        self.rec.status = Recommendation.Status.PENDING_COUNCIL
        self.rec.save(update_fields=["status"])
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "council_queue", "language": "ar"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertEqual(output["stats"]["total"], 1)

    def test_summary_employee_tasks(self):
        from apps.workflow.models import ActionPlan
        from django.utils import timezone
        # submitted_by is a non-null FK: omitting it made this test fail with
        # an IntegrityError rather than exercising the summary it is testing.
        ActionPlan.objects.create(
            recommendation=self.rec,
            target_date=timezone.localdate(),
            responsible_employee=self.users["emp"],
            submitted_by=self.users["head"],
        )


        self.client.force_authenticate(self.users["emp"])
        res = self.client.post(
            "/api/ai/summaries/",
            {"scope": "employee_tasks", "language": "en"},
        )
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertEqual(output["stats"]["total"], 1)
