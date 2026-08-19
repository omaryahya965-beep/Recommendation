from django.test import TestCase
from rest_framework.test import APIClient

from apps.workflow.models import ActionPlan
from apps.workflow.tests import drive_to_action_plan_required, make_world


class ActionPlanGeneratorTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()

    def test_generation_is_draft_only(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        self.rec.refresh_from_db()
        self.client.force_authenticate(self.users["head"])
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/action-plan/suggest/")
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertTrue(output["draft_only"])
        self.assertTrue(output["steps"])
        self.assertIn("objective", output)
        self.assertFalse(ActionPlan.objects.filter(recommendation=self.rec).exists())
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.status, "action_plan_required")

    def test_structured_output_roles(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        self.client.force_authenticate(self.users["audit"])
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/action-plan/suggest/")
        for step in res.data["analysis"]["output"]["steps"]:
            self.assertIn(step["suggested_responsible_role"], ("employee", "department_head", "audit"))
            self.assertIsInstance(step["suggested_duration_days"], int)

    def test_unauthorized_employee(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        self.client.force_authenticate(self.users["emp"])
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/action-plan/suggest/")
        self.assertEqual(res.status_code, 403)

    def test_other_department_head_forbidden(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        self.client.force_authenticate(self.users["other_head"])
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/action-plan/suggest/")
        self.assertEqual(res.status_code, 404)

    def test_not_eligible_before_ratification(self):
        self.client.force_authenticate(self.users["audit"])
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/action-plan/suggest/")
        self.assertEqual(res.status_code, 409)
