"""BUG-19: the register search understands case and report references."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audits.models import Recommendation
from apps.core.testing import make_world


class ReferenceSearchTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.other = Recommendation.objects.create(report=self.report, text="Unrelated finding", risk_level="low")
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def ids(self, term):
        res = self.client.get("/api/recommendations/", {"search": term})
        self.assertEqual(res.status_code, 200)
        return {row["id"] for row in res.json()["results"]}

    def test_case_reference_forms(self):
        for term in (f"REC-{self.rec.id:04d}", f"REC-{self.rec.id}", f"rec{self.rec.id}", f" REC-{self.rec.id:04d} "):
            self.assertEqual(self.ids(term), {self.rec.id}, term)
        # A bare number names the case and still searches the words.
        self.assertIn(self.rec.id, self.ids(str(self.rec.id)))

    def test_report_reference(self):
        self.assertEqual(self.ids(f"RPT-{self.report.id:04d}"), {self.rec.id, self.other.id})

    def test_words_still_work(self):
        self.assertEqual(self.ids("Unrelated"), {self.other.id})

    def test_scoping_still_applies(self):
        c = APIClient()
        c.force_authenticate(self.users["other_head"])
        res = c.get("/api/recommendations/", {"search": f"REC-{self.rec.id:04d}"})
        self.assertEqual(res.json()["count"], 0)
