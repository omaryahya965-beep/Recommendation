import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai.services.risk_engine import collect_risk_inputs, delay_risk_score_only
from apps.workflow.tests import drive_to_in_progress, make_world


class RiskEngineTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        self.rec.refresh_from_db()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_inputs_from_system_data(self):
        data = collect_risk_inputs(self.rec)
        self.assertEqual(data["reference"], f"REC-{self.rec.id}")
        self.assertEqual(data["status"], "in_progress")
        self.assertIsNotNone(data["target_date"])
        self.assertIn("progress_percent", data)

    def test_overdue_increases_score(self):
        plan = self.rec.action_plan
        plan.target_date = timezone.localdate() - datetime.timedelta(days=3)
        plan.save()
        high = delay_risk_score_only(self.rec)
        self.assertGreaterEqual(high["delay_risk_score"], 50)
        self.assertEqual(high["risk_level"], "HIGH")
        self.assertTrue(any("متأخر" in f or "Past" in f or "target" in f.lower() for f in high["factors"]))

    def test_missing_plan_is_not_estimable(self):
        from apps.audits.models import Recommendation
        bare = Recommendation.objects.create(
            report=self.report, text="No plan yet", risk_level="low"
        )
        estimate = delay_risk_score_only(bare)
        self.assertFalse(estimate["estimable"])
        self.assertEqual(estimate["delay_risk_score"], 0)
        self.assertLessEqual(estimate["confidence"], 60)
        self.assertTrue(estimate["missing_data"])
        self.assertIn("REC-", estimate["narrative"])

    def test_get_returns_live_estimate(self):
        res = self.client.get(f"/api/ai/recommendations/{self.rec.id}/risk/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("output", res.data)
        self.assertIn("delay_risk_score", res.data["output"])
        self.assertTrue(res.data["output"].get("narrative"))

    def test_api_wording_is_estimate(self):
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/risk/")
        self.assertEqual(res.status_code, 200)
        out = res.data["analysis"]["output"]
        self.assertIn("delay_risk_score", out)
        self.assertNotIn("will be late", (out.get("wording") or "").lower())
        self.assertTrue(out["advisory"])
