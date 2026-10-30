"""External QA: follow-up periods include their first and last day."""
from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone

from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import make_world
from apps.followup.services import build_followup_snapshot

S = Recommendation.Status


class PeriodBoundsTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        today = timezone.localdate()
        self.first, self.last = today - timedelta(days=10), today - timedelta(days=5)
        tz = timezone.get_current_timezone()
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.RATIFIED)
        # Issued at the very first instant of the period, closed at its very last.
        Recommendation.objects.filter(pk=self.rec.pk).update(
            status=S.CLOSED,
            created_at=timezone.make_aware(datetime.combine(self.first, time.min), tz),
            closed_at=timezone.make_aware(datetime.combine(self.last, time(23, 59, 59)), tz),
        )

    def totals(self, start, end):
        return build_followup_snapshot(self.muni, start, end)["totals"]

    def test_first_and_last_day_are_inside(self):
        totals = self.totals(self.first, self.last)
        self.assertEqual(totals["issued_in_period"], 1)
        self.assertEqual(totals["closed_in_period"], 1)

    def test_one_day_periods_at_each_edge(self):
        self.assertEqual(self.totals(self.first, self.first)["issued_in_period"], 1)
        self.assertEqual(self.totals(self.last, self.last)["closed_in_period"], 1)

    def test_the_day_after_is_outside(self):
        after = self.last + timedelta(days=1)
        self.assertEqual(self.totals(after, after)["closed_in_period"], 0)
