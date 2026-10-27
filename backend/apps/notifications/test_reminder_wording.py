"""Round 2, 2.2: every reminder states the real interval to its deadline.

For each anchor (plan, verification, response), each recipient role and each
default rule offset, the deadline stays fixed and the run date moves; the
reminder must name the deadline and the real number of days, in the stored
Arabic text and in the parameters the English UI renders from. A run that
catches up after missed days must state the days really left, not the rule's
nominal offset.
"""
from datetime import date, timedelta

from django.core.cache import cache
from django.test import TestCase

from apps.audits.models import AuditReport, Recommendation
from apps.core.arabic import date_ar, days
from apps.core.testing import make_world
from apps.notifications.models import Notification
from apps.notifications.services import (
    DEFAULT_ESCALATION_OFFSETS,
    DEFAULT_HEAD_OFFSETS,
    DEFAULT_RULE_OFFSETS,
    ensure_default_rules,
    run_reminders,
)
from apps.workflow.models import ActionPlan, VerificationDecision

S = Recommendation.Status
DEADLINE = date(2031, 6, 15)


class ReminderWordingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        ensure_default_rules(self.muni)

    def plan_case(self, status=S.IN_PROGRESS):
        rec = self.rec
        rec.status = status
        rec.save(update_fields=["status"])
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.RATIFIED)
        ActionPlan.objects.create(
            recommendation=rec, responsible_employee=self.users["emp"], submitted_by=self.users["head"],
            target_date=DEADLINE + timedelta(days=60), status=ActionPlan.Status.APPROVED,
        )
        return rec

    def reminders(self, user):
        return list(Notification.objects.filter(user=self.users[user], message_key="reminder").order_by("id"))

    def check(self, note, offset, anchor):
        self.assertEqual(note.message_params["days"], offset)
        self.assertEqual(note.message_params["deadline"], DEADLINE.isoformat())
        self.assertEqual(note.message_params["anchor"], anchor)
        self.assertIn(date_ar(DEADLINE), note.message)
        if offset:
            self.assertIn(days(abs(offset)), note.message)

    def walk(self, offsets, user, anchor):
        for offset in sorted(offsets):
            before = len(self.reminders(user))
            run_reminders(today=DEADLINE + timedelta(days=offset))
            notes = self.reminders(user)
            self.assertEqual(len(notes), before + 1, f"{anchor}/{user} offset {offset}")
            self.check(notes[-1], offset, anchor)

    def test_plan_deadline_employee_head_and_audit(self):
        rec = self.plan_case()
        ActionPlan.objects.filter(recommendation=rec).update(target_date=DEADLINE)
        self.walk(DEFAULT_RULE_OFFSETS, "emp", "plan")

    def test_plan_deadline_head(self):
        rec = self.plan_case()
        ActionPlan.objects.filter(recommendation=rec).update(target_date=DEADLINE)
        self.walk(DEFAULT_HEAD_OFFSETS, "head", "plan")

    def test_plan_deadline_audit_escalation(self):
        rec = self.plan_case()
        ActionPlan.objects.filter(recommendation=rec).update(target_date=DEADLINE)
        self.walk(DEFAULT_ESCALATION_OFFSETS, "audit", "plan")

    def test_verification_deadline(self):
        rec = self.plan_case(status=S.PARTIAL)
        VerificationDecision.objects.create(
            recommendation=rec, decision="partial", reviewed_by=self.users["audit"], action_deadline=DEADLINE,
        )
        self.walk(DEFAULT_RULE_OFFSETS, "emp", "verification")

    def test_response_deadline(self):
        self.rec.status = S.PENDING_RESPONSE
        self.rec.save(update_fields=["status"])
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.PENDING_RESPONSE, response_deadline=DEADLINE)
        self.walk(DEFAULT_HEAD_OFFSETS, "head", "response")
        # The employee is never reminded of the department's response.
        self.assertEqual(self.reminders("emp"), [])

    def test_catch_up_states_the_days_really_left(self):
        rec = self.plan_case()
        ActionPlan.objects.filter(recommendation=rec).update(target_date=DEADLINE)
        # First run five days before the deadline: the -14 and -7 rules are both
        # due; one reminder is sent and it says 5 days, not 7 or 14.
        run_reminders(today=DEADLINE - timedelta(days=5))
        notes = self.reminders("emp")
        self.assertEqual(len(notes), 1)
        self.check(notes[0], -5, "plan")
        self.assertNotIn(days(7), notes[0].message)
        self.assertNotIn(days(14), notes[0].message)
