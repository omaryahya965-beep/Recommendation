"""BUG-27: model output that names a case in any form is checked as REC-0016."""
from django.test import SimpleTestCase

from apps.ai.services.summarizer import _canonical_ref


class CanonicalRefTests(SimpleTestCase):
    def test_forms(self):
        for value in ("REC-16", "rec16", "REC-0016", "16"):
            self.assertEqual(_canonical_ref(value), "REC-0016")
        self.assertEqual(_canonical_ref("RPT-5"), "RPT-0005")
        self.assertEqual(_canonical_ref("nonsense"), "nonsense")
