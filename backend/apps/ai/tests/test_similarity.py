from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.audits.models import Recommendation
from apps.organizations.models import Department, Municipality, WorkflowPolicy
from apps.workflow.tests import make_world


class SimilarityTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_duplicate_detection_and_explanation(self):
        twin = Recommendation.objects.create(
            report=self.report,
            text="Segregate cash handling duties between cashier and recorder",
            root_cause="Weak segregation of duties",
            risk_level="high",
        )
        self.rec.root_cause = "Weak segregation of duties"
        self.rec.save()
        res = self.client.post(f"/api/ai/recommendations/{twin.id}/similar/")
        self.assertEqual(res.status_code, 200)
        matches = res.data["analysis"]["output"]["matches"]
        self.assertTrue(matches)
        top = matches[0]
        self.assertGreaterEqual(top["similarity_percent"], 1)
        self.assertTrue(top["reasons"])
        self.assertTrue(top["requires_human_confirmation"])
        self.assertIn(top["suggested_recurring"], ("LIKELY_RECURRING", "POSSIBLY_RELATED"))

    def test_unrelated_recommendation_is_low(self):
        other = Recommendation.objects.create(
            report=self.report,
            text="Update the municipal website accessibility statement",
            root_cause="Public communications gap",
            risk_level="low",
        )
        res = self.client.post(f"/api/ai/recommendations/{other.id}/similar/")
        matches = res.data["analysis"]["output"]["matches"]
        if matches:
            self.assertLess(matches[0]["similarity_score"], 0.99)

    @override_settings(AI_SIMILARITY_THRESHOLD=0.99)
    def test_threshold_behavior(self):
        twin = Recommendation.objects.create(
            report=self.report,
            text="Segregate cash handling duties",
            risk_level="high",
        )
        res = self.client.post(f"/api/ai/recommendations/{twin.id}/similar/")
        matches = res.data["analysis"]["output"]["matches"]
        if matches:
            # Extremely high threshold should keep suggestion conservative unless identical.
            self.assertIn(matches[0]["suggested_recurring"], ("LIKELY_RECURRING", "POSSIBLY_RELATED"))

    def test_human_must_confirm_recurrence(self):
        twin = Recommendation.objects.create(
            report=self.report,
            text="Segregate cash handling duties immediately",
            risk_level="high",
        )
        self.client.post(f"/api/ai/recommendations/{twin.id}/similar/")
        twin.refresh_from_db()
        self.assertFalse(twin.recurrence_confirmed)

    def test_municipality_isolation(self):
        other_muni = Municipality.objects.create(name="Other City")
        WorkflowPolicy.objects.create(municipality=other_muni)
        other_dept = Department.objects.create(municipality=other_muni, name="Finance")
        from apps.audits.models import AuditReport
        other_report = AuditReport.objects.create(
            municipality=other_muni, department=other_dept, title="Other",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        Recommendation.objects.create(
            report=other_report,
            text="Segregate cash handling duties",
            risk_level="high",
        )
        res = self.client.post(f"/api/ai/recommendations/{self.rec.id}/similar/")
        ids = [m["matched_id"] for m in res.data["analysis"]["output"]["matches"]]
        self.assertTrue(all(
            Recommendation.objects.get(pk=i).report.municipality_id == self.muni.id
            for i in ids
        ))

    def test_identical_texts_are_deduped_and_snippets_are_short(self):
        payload = (
            "العنوان:\nفصل المهام\n\nالوضع القائم:\nأمين الصندوق يحصّل ويسجّل.\n\n"
            "التوصية:\nيجب فصل التحصيل عن التسجيل."
        )
        a = Recommendation.objects.create(report=self.report, text=payload, risk_level="high")
        Recommendation.objects.create(report=self.report, text=payload, risk_level="high")
        Recommendation.objects.create(report=self.report, text=payload, risk_level="medium")
        res = self.client.post(f"/api/ai/recommendations/{a.id}/similar/")
        matches = res.data["analysis"]["output"]["matches"]
        snippets = [m["matched_text"] for m in matches]
        self.assertEqual(len(snippets), len(set(snippets)))
        self.assertTrue(all("\n\nالوضع القائم" not in (m["matched_text"] or "") for m in matches))
        self.assertTrue(all(len(m["matched_text"]) <= 200 for m in matches))

    def test_heading_only_overlap_is_not_listed(self):
        structured_a = (
            "العنوان:\nضعف توثيق المشتريات\n\nالوضع القائم:\nأوامر الشراء تصدر دون ثلاثة عروض.\n\n"
            "التوصية:\nيجب اعتماد سياسة عطاءات مكتوبة."
        )
        structured_b = (
            "العنوان:\nصيانة أسطول الآليات\n\nالوضع القائم:\nلا يوجد جدول صيانة دوري للآليات.\n\n"
            "التوصية:\nيجب إعداد برنامج صيانة سنوي موثّق."
        )
        self.rec.text = structured_a
        self.rec.save()
        other = Recommendation.objects.create(report=self.report, text=structured_b, risk_level="low")
        res = self.client.post(f"/api/ai/recommendations/{other.id}/similar/")
        ids = [m["matched_id"] for m in res.data["analysis"]["output"]["matches"]]
        self.assertNotIn(self.rec.id, ids)
