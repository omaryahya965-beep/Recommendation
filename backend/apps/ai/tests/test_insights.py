from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import Recommendation
from apps.workflow.tests import make_world


class InsightsAndSummaryTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
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
