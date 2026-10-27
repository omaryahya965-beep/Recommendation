"""BUG-23: every analytics figure links to a register list of the same size."""
from datetime import timedelta
from urllib.parse import quote

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import Recommendation
from apps.core.testing import make_world
from apps.workflow.models import ActionPlan

S = Recommendation.Status


class AnalyticsLinkTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        today = timezone.localdate()
        # Overdue by 5, 45 and 120 days: one in each aging bucket, plus one
        # on the 30/31 boundary.
        for days in (5, 30, 31, 45, 120):
            rec = Recommendation.objects.create(report=self.report, text=f"late {days}", risk_level="low", status=S.IN_PROGRESS)
            ActionPlan.objects.create(
                recommendation=rec, responsible_employee=self.users["emp"], submitted_by=self.users["head"],
                target_date=today - timedelta(days=days), status=ActionPlan.Status.APPROVED,
            )
        # A confirmed recurrence that is still an audit draft: analytics does
        # not count drafts, so neither may the link.
        Recommendation.objects.create(
            report=self.report, text="draft repeat", risk_level="low",
            is_recurring=True, recurrence_confirmed=True,
        )
        Recommendation.objects.create(
            report=self.report, text="issued repeat", risk_level="low", status=S.PENDING_RESPONSE,
            is_recurring=True, recurrence_confirmed=True,
        )
        self.api = APIClient()
        self.api.force_authenticate(self.users["audit"])

    def count(self, query):
        res = self.api.get(f"/api/recommendations/?{query}")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["count"]

    def test_aging_buckets_link_to_their_own_cases(self):
        aging = self.api.get("/api/analytics/").data["overdue_aging"]
        self.assertEqual(aging, {"1-30": 2, "31-90": 2, "91+": 1})
        for bucket, value in aging.items():
            self.assertEqual(self.count(f"overdue_age={quote(bucket)}&issued=true"), value, bucket)

    def test_unknown_bucket_is_refused(self):
        res = self.api.get("/api/recommendations/?overdue_age=7-9")
        self.assertEqual(res.status_code, 400)

    def test_recurrence_and_stage_links_count_issued_cases_only(self):
        data = self.api.get("/api/analytics/").data
        self.assertEqual(self.count("is_recurring=true&recurrence_confirmed=true&issued=true"), data["recurrence"]["confirmed"])
        for stage, value in data["by_stage"].items():
            self.assertEqual(self.count(f"stage={stage}&issued=true"), value, stage)
        # The draft is what made the old links disagree.
        self.assertNotEqual(self.count("is_recurring=true&recurrence_confirmed=true"), data["recurrence"]["confirmed"])
