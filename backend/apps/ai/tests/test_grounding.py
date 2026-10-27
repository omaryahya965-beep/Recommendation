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


from unittest.mock import patch  # noqa: E402

from django.test import override_settings  # noqa: E402

from apps.ai.services.assistant.runner import run_assistant  # noqa: E402
from apps.ai.tests.test_assistant import ScriptedChat, text_reply, tool_reply  # noqa: E402


@override_settings(AI_PROVIDER="openai", AI_API_KEY="sk-test", AI_MODEL="gpt-4o-mini")
class AnswerValidationTests(TestCase):
    """External QA: an answer may only name cases the tools actually returned."""

    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def run_script(self, script, language="en", conversation_id=None, message="question"):
        with patch("apps.ai.services.assistant.runner.get_chat_llm", return_value=ScriptedChat(script)):
            return run_assistant(self.users["audit"], message, language, conversation_id)

    def test_invented_reference_is_flagged(self):
        result = self.run_script([text_reply("REC-99999 is overdue and needs action.")])
        self.assertIn("REC-99999 (not verified in the system's data)", result["answer"])

    def test_invented_reference_is_flagged_in_arabic(self):
        result = self.run_script([text_reply("التوصية REC-99999 متأخرة.")], language="ar")
        self.assertIn("REC-99999 (غير متحقق منها في بيانات المنظومة)", result["answer"])

    def test_reference_from_a_tool_is_not_flagged_in_any_written_form(self):
        result = self.run_script([
            tool_reply("get_recommendation", {"id": self.rec.id}),
            text_reply(f"REC-{self.rec.id} and rec {self.rec.id} are the same case."),
        ])
        self.assertNotIn("not verified", result["answer"])

    def test_reference_verified_earlier_in_the_conversation_stays_verified(self):
        first = self.run_script([
            tool_reply("get_recommendation", {"id": self.rec.id}),
            text_reply(f"REC-{self.rec.id} is high risk."),
        ])
        second = self.run_script(
            [text_reply(f"As said, REC-{self.rec.id} is high risk; REC-424242 is unrelated.")],
            conversation_id=first["conversation_id"],
        )
        self.assertNotIn(f"REC-{self.rec.id} (not verified", second["answer"])
        self.assertIn("REC-424242 (not verified", second["answer"])
