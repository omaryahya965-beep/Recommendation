"""The catch-up reminder engine: never skips because a cron missed a day,
never sends twice, never sends a stale "days left" reminder."""
import datetime
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import (
    close_via_council,
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    submit_to_audit,
)
from apps.notifications.models import Notification, ReminderDispatch, ReminderRule, ReminderRun
from apps.notifications.services import ensure_default_rules, run_reminders
from apps.workflow import services
from apps.workflow.models import ActionPlan

TODAY = timezone.localdate()
DAY = datetime.timedelta(days=1)


class CatchUpTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        # Employee rules only, to keep each scenario readable.
        for offset in (-7, -3, 0, 1, 7):
            ReminderRule.objects.create(
                municipality=self.muni, offset_days=offset, recipient_role=ReminderRule.RecipientRole.EMPLOYEE
            )
        drive_to_in_progress(self.users, self.report, self.rec)

    def set_deadline(self, deadline):
        ActionPlan.objects.filter(recommendation=self.rec).update(target_date=deadline)

    def sent(self):
        return Notification.objects.filter(dedupe_key__startswith="reminder:", user=self.users["emp"])

    def test_a_missed_day_is_caught_up(self):
        self.set_deadline(TODAY + 7 * DAY)
        run_reminders(today=TODAY - DAY)  # the -7 milestone was not due yesterday
        self.assertEqual(self.sent().count(), 0)
        run_reminders(today=TODAY + DAY)  # cron skipped "today"
        self.assertEqual(self.sent().count(), 1)
        self.assertIn("6", self.sent().get().message)  # says what is really left

    def test_a_long_outage_sends_one_current_reminder_not_a_burst(self):
        self.set_deadline(TODAY - 10 * DAY)
        self.assertEqual(run_reminders(), 1)
        note = self.sent().get()
        self.assertEqual(note.type, Notification.Type.OVERDUE)
        dispatches = ReminderDispatch.objects.filter(recommendation=self.rec)
        self.assertEqual(dispatches.filter(outcome="sent").count(), 1)
        self.assertEqual(dispatches.filter(outcome="superseded").count(), 4)
        self.assertEqual(dispatches.get(outcome="sent").offset_days, 7)

    def test_running_twice_never_duplicates(self):
        self.set_deadline(TODAY + 3 * DAY)
        self.assertEqual(run_reminders(), 1)
        self.assertEqual(run_reminders(), 0)
        self.assertEqual(run_reminders(), 0)
        self.assertEqual(self.sent().count(), 1)

    def test_a_deleted_notification_is_not_sent_again(self):
        self.set_deadline(TODAY + 3 * DAY)
        run_reminders()
        self.sent().delete()
        self.assertEqual(run_reminders(), 0)

    def test_moving_the_deadline_starts_a_new_cycle(self):
        self.set_deadline(TODAY + 3 * DAY)
        run_reminders()
        self.set_deadline(TODAY + 7 * DAY)
        self.assertEqual(run_reminders(), 1)
        self.assertEqual(self.sent().count(), 2)

    def test_closed_case_gets_no_reminders(self):
        self.set_deadline(TODAY)
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        close_via_council(self.users, self.rec)
        self.assertEqual(run_reminders(), 0)

    def test_waiting_on_audit_gets_no_department_reminders(self):
        self.set_deadline(TODAY - 2 * DAY)
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        self.assertEqual(run_reminders(), 0)

    def test_deactivated_user_is_skipped(self):
        self.set_deadline(TODAY)
        User.objects.filter(pk=self.users["emp"].pk).update(is_active=False)
        self.assertEqual(run_reminders(), 0)

    def test_disabled_then_reenabled_rule(self):
        self.set_deadline(TODAY + 3 * DAY)
        ReminderRule.objects.update(enabled=False)
        self.assertEqual(run_reminders(), 0)
        ReminderRule.objects.update(enabled=True)
        self.assertEqual(run_reminders(), 1)

    def test_verification_deadline_drives_returned_work(self):
        """W1: after a partial verification the audit-set date is the anchor."""
        self.set_deadline(TODAY - 30 * DAY)
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        self.rec.refresh_from_db()
        services.verify(
            self.rec, self.users["audit"], decision="partial", rejected_items="a",
            rejection_reason="b", required_action="c", action_deadline=TODAY + 3 * DAY,
        )
        Notification.objects.all().delete()
        self.assertEqual(run_reminders(), 1)
        dispatch = ReminderDispatch.objects.get(outcome="sent")
        self.assertEqual(dispatch.anchor, "verification")
        self.assertEqual(dispatch.deadline, TODAY + 3 * DAY)

    def test_legacy_exact_day_reminders_are_respected(self):
        self.set_deadline(TODAY + 3 * DAY)
        rule = ReminderRule.objects.get(offset_days=-3)
        Notification.objects.create(
            user=self.users["emp"], recommendation=self.rec, type=Notification.Type.DEADLINE_APPROACHING,
            dedupe_key=f"rule:{rule.id}:rec:{self.rec.id}:user:{self.users['emp'].id}:{TODAY.isoformat()}",
        )
        self.assertEqual(run_reminders(), 0)

    def test_each_run_is_recorded(self):
        self.set_deadline(TODAY + 3 * DAY)
        run_reminders(trigger="cron")
        run = ReminderRun.objects.get()
        self.assertEqual((run.status, run.trigger, run.sent), ("ok", "cron", 1))


class ResponseDeadlineTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        ensure_default_rules(self.muni)
        self.second = Recommendation.objects.create(report=self.report, text="Second", risk_level="low")
        AuditReport.objects.filter(pk=self.report.pk).update(response_deadline=TODAY + 3 * DAY)
        self.report.refresh_from_db()
        services.submit_report_to_department(self.report, self.users["audit"])
        Notification.objects.all().delete()

    def test_heads_are_reminded_per_unanswered_recommendation(self):
        self.assertEqual(run_reminders(), 2)
        notes = Notification.objects.filter(user=self.users["head"])
        self.assertEqual(notes.count(), 2)
        self.assertTrue(all(note.type == Notification.Type.RESPONSE_NEEDED for note in notes))

    def test_answering_one_keeps_reminding_about_the_other(self):
        """The old engine stopped once the report left pending_response."""
        self.rec.refresh_from_db()
        services.submit_response(self.rec, self.users["head"], decision="agree")
        self.report.refresh_from_db()
        self.assertEqual(self.report.status, AuditReport.Status.UNDER_REVIEW)
        Notification.objects.all().delete()
        self.assertEqual(run_reminders(), 1)
        self.assertEqual(Notification.objects.get(user=self.users["head"]).recommendation_id, self.second.id)


class DefaultsAndStatusTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_defaults_include_department_head_rules(self):
        ensure_default_rules(self.muni)
        roles = set(ReminderRule.objects.values_list("recipient_role", flat=True))
        self.assertEqual(roles, {"employee", "department_head", "audit"})

    def test_ensure_reminder_defaults_is_a_dry_run_unless_applied(self):
        ReminderRule.objects.create(municipality=self.muni, offset_days=-7, recipient_role="employee", enabled=False)
        out = StringIO()
        call_command("ensure_reminder_defaults", stdout=out)
        self.assertEqual(ReminderRule.objects.count(), 1)
        self.assertIn("Dry run", out.getvalue())
        call_command("ensure_reminder_defaults", "--apply", stdout=StringIO())
        self.assertEqual(ReminderRule.objects.count(), 15)
        # The administrator's own rule is untouched.
        self.assertFalse(ReminderRule.objects.get(offset_days=-7, recipient_role="employee").enabled)

    def test_status_endpoint_reports_the_last_run(self):
        run_reminders(trigger="cron")
        client = APIClient()
        client.force_authenticate(self.users["audit"])
        data = client.get("/api/reminder-rules/status/").data
        self.assertTrue(data["healthy"])
        self.assertEqual(data["last_run"]["trigger"], "cron")
        self.assertEqual(data["missing_defaults"], 15)

    def test_report_events_notify_once_per_report(self):
        Recommendation.objects.create(report=self.report, text="Second", risk_level="low")
        services.submit_report_to_department(self.report, self.users["audit"])
        notes = Notification.objects.filter(user=self.users["head"])
        self.assertEqual(notes.count(), 1)
        self.assertEqual(notes.get().report_id, self.report.id)
        self.assertIsNone(notes.get().recommendation_id)

    def test_case_detail_lists_sent_reminders(self):
        ensure_default_rules(self.muni)
        drive_to_in_progress(self.users, self.report, self.rec)
        ActionPlan.objects.filter(recommendation=self.rec).update(target_date=TODAY)
        run_reminders()
        client = APIClient()
        client.force_authenticate(self.users["audit"])
        reminders = client.get(f"/api/recommendations/{self.rec.id}/").data["reminders"]
        self.assertTrue(reminders)
        self.assertEqual(reminders[0]["anchor"], "plan")
