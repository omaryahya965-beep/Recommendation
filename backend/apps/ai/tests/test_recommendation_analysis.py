import json
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.ai.models import AIAnalysis, AIJob
from apps.workflow.tests import make_world


class RecommendationAnalysisAPITests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_valid_analysis_is_stored_separately(self):
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "completed")
        output = res.data["analysis"]["output"]
        self.assertIn("quality_score", output)
        self.assertTrue(0 <= output["quality_score"] <= 100)
        self.assertTrue(output.get("does_not_change_workflow"))
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.text, "Segregate cash handling duties")
        self.assertEqual(self.rec.status, "draft")
        self.assertEqual(
            AIAnalysis.objects.filter(
                analysis_type="recommendation", target_id=self.rec.id
            ).count(),
            1,
        )

    def test_malformed_ai_response_does_not_store_trusted_garbage(self):
        class Bad:
            name = "openai"
            model = "fake"

            def generate(self, *args, **kwargs):
                return "<<<not-json>>>"

        with patch("apps.ai.services.common.get_llm_provider", return_value=Bad()):
            res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(res.status_code, 200)
        output = res.data["analysis"]["output"]
        self.assertIn("quality_score", output)
        self.assertNotIn("<<<", json.dumps(output))

    def test_unauthorized_other_department(self):
        self.client.force_authenticate(self.users["other_head"])
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(res.status_code, 404)

    def test_missing_recommendation(self):
        res = self.client.post("/api/ai/recommendations/99999/analyze/")
        self.assertEqual(res.status_code, 404)

    def test_employee_cannot_see_unassigned(self):
        self.client.force_authenticate(self.users["emp"])
        res = self.client.get(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(res.status_code, 404)

    def test_cache_reuses_hash(self):
        first = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        second = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(first.data["analysis"]["id"], second.data["analysis"]["id"])
        self.assertEqual(
            AIAnalysis.objects.filter(
                analysis_type="recommendation", target_id=self.rec.id
            ).count(),
            1,
        )
        self.assertEqual(AIJob.objects.filter(job_type="recommendation_analysis").count(), 2)

    def test_get_returns_case_brief(self):
        res = self.client.get(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(res.status_code, 200)
        out = res.data["output"]
        self.assertIn("brief", out)
        self.assertIn(f"REC-{self.rec.id}", out["brief"])
        self.assertTrue(out["next_action"])
        self.assertNotIn("lack of information", " ".join(out.get("issues") or []).lower())

    def test_structured_finding_mentions_the_content(self):
        self.rec.text = (
            "العنوان:\nفصل مهام أمين الصندوق\n\n"
            "الوضع القائم:\nأمين الصندوق يسجّل القيود ويحصّل النقد دون مراجعة مستقلة.\n\n"
            "المعيار:\nاللائحة المالية تتطلب فصل التحصيل عن التسجيل المحاسبي.\n\n"
            "الأثر:\nارتفاع مخاطر الاختلاس وتعذر تتبع العهدة.\n\n"
            "التوصية:\nيجب فصل مهام التحصيل عن ترحيل القيود واعتماد إجراء مكتوب."
        )
        self.rec.root_cause = "غياب إجراء فصل مهام معتمد"
        self.rec.save()
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/", {"language": "ar"})
        out = res.data["analysis"]["output"]
        self.assertGreaterEqual(out["quality_score"], 55)
        self.assertIn("أمين الصندوق", out["brief"])
        self.assertIn("فصل", out["how_to_resolve"])
        joined = " ".join(out.get("issues") or [])
        self.assertNotIn("موعد مستهدف", joined)
        self.assertNotIn("رد الإدارة", joined)

    def test_repeated_placeholder_is_flagged(self):
        self.rec.text = (
            "العنوان:\nOmarYahya\n\nالوضع القائم:\nOmarYahya\n\n"
            "المعيار:\nOmarYahya\n\nالأثر:\nOmarYahya\n\nالتوصية:\nOmarYahya"
        )
        self.rec.save()
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/", {"language": "ar"})
        out = res.data["analysis"]["output"]
        self.assertTrue(any("مكرر" in item for item in out["issues"]))
        self.assertLess(out["quality_score"], 50)
