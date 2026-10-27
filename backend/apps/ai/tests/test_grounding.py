"""BUG-27: the assistant's figures are the dashboard's figures."""
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai.services.assistant.tools import (
    tool_get_overdue_recommendations,
    tool_get_portfolio,
    tool_get_recurring_findings,
)
from apps.audits.models import Recommendation
from apps.core.testing import make_world
from apps.workflow.models import ActionPlan

S = Recommendation.Status


class AssistantGroundingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()  # self.rec: a high-risk draft
        Recommendation.objects.create(report=self.report, text="issued high", risk_level="high", status=S.PENDING_RESPONSE)
        Recommendation.objects.create(
            report=self.report, text="draft repeat", risk_level="low", is_recurring=True, recurrence_confirmed=True,
        )
        Recommendation.objects.create(
            report=self.report, text="issued repeat", risk_level="low", status=S.PENDING_RESPONSE,
            is_recurring=True, recurrence_confirmed=True,
        )
        late = Recommendation.objects.create(report=self.report, text="late", risk_level="low", status=S.IN_PROGRESS)
        ActionPlan.objects.create(
            recommendation=late, responsible_employee=self.users["emp"], submitted_by=self.users["head"],
            target_date=timezone.localdate() - timedelta(days=3), status=ActionPlan.Status.APPROVED,
        )
        api = APIClient()
        api.force_authenticate(self.users["audit"])
        self.analytics = api.get("/api/analytics/").data

    def test_portfolio_matches_the_dashboard(self):
        portfolio = tool_get_portfolio(self.users["audit"])
        totals = self.analytics["totals"]
        self.assertEqual(portfolio["total"], totals["total"])
        self.assertEqual(portfolio["drafts"], totals["drafts"])
        self.assertEqual(portfolio["high_risk_open"]["count"], totals["high_risk_open"])
        self.assertEqual(portfolio["overdue"]["count"], totals["overdue"])
        self.assertEqual(portfolio["recurring"]["count"], self.analytics["recurrence"]["confirmed"])
        listed = {item["id"] for item in portfolio["high_risk_open"]["items"]}
        self.assertNotIn(self.rec.id, listed, "a draft is not an open high-risk case")

    def test_lists_leave_out_drafts(self):
        user = self.users["audit"]
        self.assertEqual(len(tool_get_overdue_recommendations(user)), self.analytics["totals"]["overdue"])
        self.assertEqual(len(tool_get_recurring_findings(user)), self.analytics["recurrence"]["confirmed"])

