import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import Notification, ReminderRule
from apps.notifications.services import ensure_default_rules, run_reminders
from apps.workflow import services
from apps.workflow.tests import drive_to_in_progress, make_world


class ReminderEngineTest(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        ensure_default_rules(self.muni)
        drive_to_in_progress(self.users, self.report, self.rec)

    def _set_target(self, days_from_today):
        plan = self.rec.action_plan
        plan.target_date = timezone.localdate() + datetime.timedelta(days=days_from_today)
        plan.save()

    def test_reminder_fires_at_configured_offset(self):
        self._set_target(7)  # matches the -7 rule
        created = run_reminders()
        self.assertEqual(created, 1)
        note = Notification.objects.get(dedupe_key__isnull=False)
        self.assertEqual(note.user, self.users["emp"])
        self.assertEqual(note.type, Notification.Type.DEADLINE_APPROACHING)

    def test_idempotent_no_duplicates(self):
        self._set_target(7)
        first = run_reminders()
        second = run_reminders()
        third = run_reminders()
        self.assertEqual(first, 1)
        self.assertEqual(second, 0)
        self.assertEqual(third, 0)
        self.assertEqual(Notification.objects.filter(dedupe_key__isnull=False).count(), 1)

    def test_overdue_escalates_to_audit(self):
        self._set_target(-7)  # matches +7 rules: employee AND audit escalation
        created = run_reminders()
        recipients = set(
            Notification.objects.filter(dedupe_key__isnull=False).values_list(
                "user__role", flat=True
            )
        )
        self.assertEqual(created, 2)
        self.assertEqual(recipients, {User.Role.EMPLOYEE, User.Role.AUDIT})

    def test_disabled_rule_does_not_fire(self):
        self._set_target(7)
        ReminderRule.objects.filter(offset_days=-7).update(enabled=False)
        self.assertEqual(run_reminders(), 0)

    def test_no_reminders_for_closed_recommendations(self):
        self._set_target(0)
        from apps.workflow.tests import close_via_council, finish_steps_and_evidence, submit_to_audit
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        close_via_council(self.users, self.rec)
        self.assertEqual(run_reminders(), 0)


class NotificationApiTest(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()

    def test_list_includes_recommendation_context(self):
        Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.ACTION_REQUIRED,
            message="رد إدارة جديد بانتظار مراجعة التدقيق الداخلي.",
        )
        self.client.force_authenticate(self.users["audit"])
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        item = response.data["results"][0]
        self.assertEqual(item["type"], "action_required")
        self.assertEqual(item["recommendation"], self.rec.id)
        self.assertEqual(item["department_name"], self.dept.name)
        self.assertEqual(item["status"], self.rec.status)
        self.assertIn("overdue", item)
        self.assertFalse(item["is_read"])

    def test_user_only_sees_own_notifications(self):
        Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.ACTION_REQUIRED,
            message="for audit",
        )
        self.client.force_authenticate(self.users["head"])
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_mark_read(self):
        note = Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.RETURNED,
            message="أُعيد رد الإدارة للتعديل",
        )
        self.client.force_authenticate(self.users["audit"])
        response = self.client.post(f"/api/notifications/{note.id}/mark-read/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_read"])
        note.refresh_from_db()
        self.assertTrue(note.is_read)

    def test_mark_all_read(self):
        Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.ACTION_REQUIRED,
            message="one",
        )
        Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.OVERDUE,
            message="two",
        )
        self.client.force_authenticate(self.users["audit"])
        response = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["marked_read"], 2)
        self.assertEqual(
            Notification.objects.filter(user=self.users["audit"], is_read=False).count(), 0
        )

    def test_delete_own_notification(self):
        note = Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.ACTION_REQUIRED,
            message="dismiss me",
        )
        self.client.force_authenticate(self.users["audit"])
        response = self.client.delete(f"/api/notifications/{note.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Notification.objects.filter(pk=note.id).exists())

    def test_cannot_delete_another_users_notification(self):
        note = Notification.objects.create(
            user=self.users["audit"],
            recommendation=self.rec,
            type=Notification.Type.ACTION_REQUIRED,
            message="audit only",
        )
        self.client.force_authenticate(self.users["head"])
        response = self.client.delete(f"/api/notifications/{note.id}/")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(Notification.objects.filter(pk=note.id).exists())


class ReminderRuleApiTest(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()

    def test_audit_can_manage_rules(self):
        self.client.force_authenticate(self.users["audit"])
        response = self.client.post(
            "/api/reminder-rules/",
            {"offset_days": -10, "recipient_role": "employee", "enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        rule_id = response.data["id"]

        response = self.client.patch(
            f"/api/reminder-rules/{rule_id}/", {"enabled": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["enabled"])

        response = self.client.delete(f"/api/reminder-rules/{rule_id}/")
        self.assertEqual(response.status_code, 204)

    def test_duplicate_rule_rejected(self):
        self.client.force_authenticate(self.users["audit"])
        payload = {"offset_days": -5, "recipient_role": "employee"}
        self.assertEqual(
            self.client.post("/api/reminder-rules/", payload, format="json").status_code, 201
        )
        self.assertEqual(
            self.client.post("/api/reminder-rules/", payload, format="json").status_code, 400
        )

    def test_non_audit_cannot_manage_rules(self):
        self.client.force_authenticate(self.users["head"])
        response = self.client.get("/api/reminder-rules/")
        self.assertEqual(response.status_code, 403)


class SendRemindersCronApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_rejects_missing_or_wrong_secret(self):
        self.assertEqual(self.client.get("/api/internal/send-reminders/").status_code, 401)
        with self.settings(CRON_SECRET="expected"):
            response = self.client.get(
                "/api/internal/send-reminders/",
                HTTP_AUTHORIZATION="Bearer wrong",
            )
        self.assertEqual(response.status_code, 401)

    def test_unset_secret_never_opens_the_endpoint(self):
        with self.settings(CRON_SECRET=""):
            response = self.client.get(
                "/api/internal/send-reminders/",
                HTTP_AUTHORIZATION="Bearer anything",
            )
        self.assertEqual(response.status_code, 401)

    def test_authorized_get_runs_the_same_engine_as_the_management_command(self):
        muni, _dept, users, report, rec = make_world()
        ensure_default_rules(muni)
        drive_to_in_progress(users, report, rec)
        rec.action_plan.target_date = timezone.localdate() + datetime.timedelta(days=7)
        rec.action_plan.save()
        with self.settings(CRON_SECRET="expected"):
            response = self.client.get(
                "/api/internal/send-reminders/",
                HTTP_AUTHORIZATION="Bearer expected",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["ok"], True)
        self.assertEqual(response.data["created"], 1)
