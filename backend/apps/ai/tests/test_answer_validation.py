"""Round 2, 2.4: the assistant's answer is checked against the database.

Deterministic: the model is a script. An answer that names a case or report
that does not exist (or is out of scope), states a date that is not one of the
case's dates, or reports an approved plan as missing is rejected; the model
gets one corrected retry, then the user gets a safe answer built from records.
"""
import datetime
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.ai.models import AIMessage
from apps.ai.services.assistant.runner import run_assistant
from apps.ai.services.assistant.validation import validate_answer
from apps.ai.tests.test_assistant import ScriptedChat, text_reply, tool_reply
from apps.audits.models import AuditReport, Recommendation
from apps.core.refs import record_code
from apps.core.testing import make_world
from apps.organizations.models import Department
from apps.workflow.models import ActionPlan, ActionStep

S = Recommendation.Status


@override_settings(AI_PROVIDER="openai", AI_API_KEY="sk-test", AI_MODEL="gpt-4o-mini")
class AnswerValidationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.RATIFIED)
        self.rec.status = S.IN_PROGRESS
        self.rec.save(update_fields=["status"])
        self.target = timezone.localdate() + datetime.timedelta(days=40)
        self.plan = ActionPlan.objects.create(
            recommendation=self.rec, responsible_employee=self.users["emp"], submitted_by=self.users["head"],
            target_date=self.target, status=ActionPlan.Status.APPROVED,
        )
        ActionStep.objects.create(plan=self.plan, title="Only step", order=1, is_done=True, progress_percent=100)
        self.ref = record_code(self.rec.id)
        # A case in another department: real, but out of the head's scope.
        other = Department.objects.create(municipality=self.muni, name="Parks")
        other_report = AuditReport.objects.create(
            municipality=self.muni, department=other, title="Parks", engagement_type="assurance",
            created_by=self.users["audit"], status=AuditReport.Status.RATIFIED,
        )
        self.foreign = Recommendation.objects.create(report=other_report, text="parks", risk_level="low", status=S.IN_PROGRESS)

    def run_script(self, script, user="audit", language="en"):
        chat = ScriptedChat(script)
        with patch("apps.ai.services.assistant.runner.get_chat_llm", return_value=chat):
            return run_assistant(self.users[user], "question", language), chat

    # --- the validator -------------------------------------------------------
    def test_validator_accepts_true_statements_in_every_date_format(self):
        for text in (
            f"{self.ref} is due on {self.target.isoformat()}; its plan is approved and 100% done.",
            f"{self.ref} is due on {self.target.day} {self.target.strftime('%B')} {self.target.year}.",
        ):
            problems, facts = validate_answer(self.users["audit"], text)
            self.assertEqual(problems, [], text)
            self.assertIn(self.ref, facts)

    def test_validator_rejects_invented_and_out_of_scope_references(self):
        problems, _ = validate_answer(self.users["audit"], "REC-99999 is overdue. RPT-77777 was ratified.")
        self.assertEqual({p.kind for p in problems}, {"unknown_reference"})
        self.assertEqual(len(problems), 2)
        problems, _ = validate_answer(self.users["head"], f"{record_code(self.foreign.id)} is in progress.")
        self.assertEqual([p.kind for p in problems], ["unknown_reference"])

    def test_validator_rejects_a_wrong_date_and_a_missing_plan_claim(self):
        problems, _ = validate_answer(self.users["audit"], f"{self.ref} has no action plan and is due 2030-01-01.")
        self.assertEqual({p.kind for p in problems}, {"plan_missing_claim", "wrong_date"})
        problems, _ = validate_answer(self.users["audit"], f"{self.ref}: the plan is at 40% progress.")
        self.assertEqual([p.kind for p in problems], ["wrong_progress"])

    def test_validator_reads_arabic_dates(self):
        from apps.core.arabic import date_ar

        ok, _ = validate_answer(self.users["audit"], f"موعد {self.ref} هو {date_ar(self.target)}.")
        self.assertEqual(ok, [])
        bad, _ = validate_answer(self.users["audit"], f"موعد {self.ref} هو 3 يناير 2030.")
        self.assertEqual([p.kind for p in bad], ["wrong_date"])

    # --- the runner: reject, retry once, then fall back ------------------------
    def test_invented_reference_is_rejected_and_the_retry_is_used(self):
        result, chat = self.run_script([
            text_reply("REC-99999 is overdue and needs action."),
            text_reply(f"I found no case REC-... in your records; {self.ref} is the only open case."),
        ])
        self.assertEqual(result["validation"], "retried")
        self.assertNotIn("99999", result["answer"])
        self.assertIn("REC-99999", chat.calls[1]["messages"][-1]["content"], "the retry is told what was wrong")

    def test_invented_reference_twice_gives_a_safe_answer(self):
        result, _ = self.run_script([text_reply("REC-99999 is overdue."), text_reply("REC-99998 is overdue.")])
        self.assertEqual(result["validation"], "fallback")
        self.assertNotIn("9999", result["answer"])
        self.assertIn("could not verify", result["answer"])
        stored = AIMessage.objects.filter(role=AIMessage.Role.ASSISTANT).latest("created_at")
        self.assertNotIn("9999", stored.content)
        self.assertEqual(stored.metadata["validation"], "fallback")

    def test_an_approved_complete_plan_is_never_reported_missing(self):
        result, _ = self.run_script([
            tool_reply("get_action_plan_status", {"id": self.rec.id}),
            text_reply(f"{self.ref} has no action plan yet."),
            text_reply(f"{self.ref} has no action plan yet."),
        ])
        self.assertEqual(result["validation"], "fallback")
        self.assertNotIn("no action plan", result["answer"])
        self.assertIn("approved", result["answer"])
        self.assertIn("100%", result["answer"])

    def test_a_wrong_date_is_corrected_on_retry(self):
        result, chat = self.run_script([
            text_reply(f"{self.ref} is due on 2030-01-01."),
            text_reply(f"{self.ref} is due on {self.target.isoformat()}."),
        ])
        self.assertEqual(result["validation"], "retried")
        self.assertIn(self.target.isoformat(), result["answer"])
        self.assertIn(self.target.isoformat(), chat.calls[1]["messages"][-1]["content"], "the retry gets the real deadline")

    def test_a_wrong_date_twice_gives_the_real_one_in_arabic(self):
        from apps.core.arabic import date_ar

        result, _ = self.run_script(
            [text_reply(f"موعد {self.ref} هو 3 يناير 2030."), text_reply(f"موعد {self.ref} هو 4 يناير 2030.")],
            language="ar",
        )
        self.assertEqual(result["validation"], "fallback")
        self.assertIn("تعذّر التحقق", result["answer"])
        self.assertIn(date_ar(self.target), result["answer"])
        self.assertNotIn("2030", result["answer"])

    def test_a_correct_answer_passes_untouched(self):
        result, chat = self.run_script([text_reply(f"{self.ref} is due on {self.target.isoformat()}.")])
        self.assertEqual(result["validation"], "passed")
        self.assertEqual(len(chat.calls), 1)

    def test_out_of_scope_case_is_never_shown_to_a_head(self):
        foreign = record_code(self.foreign.id)
        result, _ = self.run_script([text_reply(f"{foreign} is late."), text_reply(f"{foreign} is late.")], user="head")
        self.assertEqual(result["validation"], "fallback")
        self.assertNotIn(foreign, result["answer"])

    def test_stating_today_next_to_a_case_is_not_an_error(self):
        problems, _ = validate_answer(self.users["audit"], f"As of {timezone.localdate().isoformat()}, {self.ref} is in progress.")
        self.assertEqual(problems, [])
        problems, _ = validate_answer(self.users["audit"], f"{self.ref} as of {timezone.localdate().isoformat()} is in progress.")
        self.assertEqual(problems, [])


class EvalCommandTests(TestCase):
    def test_dry_run_asks_twenty_questions_per_role(self):
        from io import StringIO

        from django.core.management import call_command

        make_world()
        out = StringIO()
        call_command("ai_eval", dry_run=True, language="en", stdout=out)
        text = out.getvalue()
        for role in ("audit", "department_head", "employee", "council"):
            self.assertIn(role, text)
        self.assertEqual(text.count("  Q: "), 80)

