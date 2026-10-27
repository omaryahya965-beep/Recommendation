"""Round 2, 1.3: each register sort option orders what its label says."""
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import make_world
from apps.workflow.models import ActionPlan

S = Recommendation.Status
RANK = {"high": 3, "medium": 2, "low": 1}


class SortOptionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.RATIFIED)
        self.rec.delete()
        today = timezone.localdate()
        # risk, priority score, plan target (days), status
        spec = [
            ("low", 90, 3, S.IN_PROGRESS),
            ("high", 0, 30, S.IN_PROGRESS),
            ("high", 0, 5, S.PARTIAL),
            ("medium", 50, 1, S.IN_PROGRESS),
            ("high", 10, None, S.SUBMITTED_FOR_VERIFICATION),
            ("low", 0, 10, S.REOPENED),
        ]
        for risk, score, days, status in spec:
            rec = Recommendation.objects.create(
                report=self.report, text=f"{risk} {score}", risk_level=risk, priority_score=score, status=status
            )
            if days is not None:
                ActionPlan.objects.create(
                    recommendation=rec, responsible_employee=self.users["emp"], submitted_by=self.users["head"],
                    target_date=today + timedelta(days=days), status=ActionPlan.Status.APPROVED,
                )
        self.api = APIClient()
        self.api.force_authenticate(self.users["audit"])

    def rows(self, ordering):
        res = self.api.get("/api/recommendations/", {"ordering": ordering, "page_size": 50})
        self.assertEqual(res.status_code, 200)
        return res.data["results"]

    def test_priority_score_option_orders_by_the_audit_score(self):
        # The label says "Audit priority score": the auditor-set 0-100 number, highest first.
        scores = [row["priority_score"] for row in self.rows("-priority_score")]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_risk_option_is_severity_then_nearest_deadline(self):
        rows = self.rows("-risk_level,deadline")
        ranks = [RANK[row["risk_level"]] for row in rows]
        self.assertEqual(ranks, sorted(ranks, reverse=True))
        high = [row["deadline"] for row in rows if row["risk_level"] == "high"]
        dated = [d for d in high if d]
        self.assertEqual(dated, sorted(dated))
        self.assertEqual(high[-1], None, "an undated case sorts after dated ones")

    def test_deadline_option_is_nearest_first_undated_last(self):
        deadlines = [row["deadline"] for row in self.rows("deadline")]
        dated = sorted(d for d in deadlines if d)
        self.assertEqual(deadlines, dated + [None] * (len(deadlines) - len(dated)))

    def test_default_order_is_unchanged(self):
        # No ordering parameter: the model default (-priority_score, -created_at).
        res = self.api.get("/api/recommendations/", {"page_size": 50})
        ids = [row["id"] for row in res.data["results"]]
        expected = list(
            Recommendation.objects.filter(report=self.report).order_by("-priority_score", "-created_at").values_list("id", flat=True)
        )
        self.assertEqual(ids, expected)
