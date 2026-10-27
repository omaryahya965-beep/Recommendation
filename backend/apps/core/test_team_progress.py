"""Round 2, 2.2: team progress comes from real statuses and is never 100% while
an assigned case is still open."""
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import make_world
from apps.workflow.models import ActionPlan

S = Recommendation.Status


class TeamProgressTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.RATIFIED)
        self.rec.delete()
        today = timezone.localdate()

        def case(employee, status):
            rec = Recommendation.objects.create(report=self.report, text=status, risk_level="low", status=status)
            ActionPlan.objects.create(
                recommendation=rec, responsible_employee=self.users[employee], submitted_by=self.users["head"],
                target_date=today + timedelta(days=20), status=ActionPlan.Status.APPROVED,
            )

        # emp: one in progress, one submitted for verification, one verified and closed.
        for status in (S.IN_PROGRESS, S.SUBMITTED_FOR_VERIFICATION, S.CLOSED):
            case("emp", status)
        # emp2: 199 closed and one still open: rounding must not reach 100%.
        for _ in range(199):
            case("emp2", S.CLOSED)
        case("emp2", S.PENDING_HEAD_REVIEW)
        self.api = APIClient()
        self.api.force_authenticate(self.users["head"])

    def rows(self):
        res = self.api.get("/api/team/workload/")
        self.assertEqual(res.status_code, 200)
        return {row["employee"]["id"]: row for row in res.data["employees"]}

    def test_completion_counts_closed_cases_against_all_assigned(self):
        row = self.rows()[self.users["emp"].id]
        self.assertEqual(row["open"], 2)  # in progress + submitted (awaiting verification)
        self.assertEqual(row["completed"], 1)
        self.assertEqual(row["completion_rate"], 33)

    def test_never_100_percent_while_a_case_is_open(self):
        row = self.rows()[self.users["emp2"].id]
        self.assertEqual(row["open"], 1)
        self.assertEqual(row["completed"], 199)
        self.assertLess(row["completion_rate"], 100)

    def test_all_closed_is_100_percent(self):
        Recommendation.objects.filter(action_plan__responsible_employee=self.users["emp2"]).update(status=S.CLOSED)
        row = self.rows()[self.users["emp2"].id]
        self.assertEqual(row["open"], 0)
        self.assertEqual(row["completion_rate"], 100)
