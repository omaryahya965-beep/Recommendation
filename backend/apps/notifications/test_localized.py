"""BUG-16: notifications carry a message key and parameters, so each user
reads them in their own UI language; older rows keep their stored text."""
import datetime

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.testing import drive_to_in_progress, finish_steps_and_evidence, make_world
from apps.notifications.models import Notification, ReminderRule
from apps.notifications.services import run_reminders
from apps.workflow import services


class LocalizedNotificationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def latest(self, who):
        return Notification.objects.filter(user=self.users[who]).order_by("-sent_at", "-id").first()

    def test_report_sent_to_department(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        n = self.latest("head")
        self.assertEqual(n.message_key, "report_sent_to_department")
        self.assertEqual(n.message_params["title"], "Cash audit")
        self.assertEqual(n.message_params["count"], 1)
        self.assertTrue(n.message)  # Arabic text kept for older readers

    def test_head_return_carries_notes(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        services.mark_implemented(self.rec, self.users["emp"])
        self.rec.refresh_from_db()
        services.review_implementation(self.rec, self.users["head"], accept=False, notes="sign it")
        n = self.latest("emp")
        self.assertEqual(n.message_key, "implementation_returned")
        self.assertEqual(n.message_params, {"ref": f"REC-{self.rec.id:04d}", "notes": "sign it"})

    def test_every_workflow_notification_has_a_key(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        self.assertFalse(Notification.objects.filter(message_key="").exists())

    def test_reminders_have_a_key_and_real_numbers(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        plan = self.rec.action_plan
        plan.target_date = timezone.localdate() - datetime.timedelta(days=3)
        plan.save()
        ReminderRule.objects.create(municipality=self.muni, offset_days=1, recipient_role="employee")
        run_reminders()
        n = Notification.objects.filter(user=self.users["emp"], type=Notification.Type.OVERDUE).latest("id")
        self.assertEqual(n.message_key, "reminder")
        self.assertEqual(n.message_params["anchor"], "plan")
        self.assertEqual(n.message_params["days"], 3)
        self.assertEqual(n.message_params["deadline"], str(plan.target_date))

    def test_api_exposes_key_and_params_and_old_rows_still_work(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        Notification.objects.create(user=self.users["head"], type="status_change", message="رسالة قديمة")
        c = APIClient()
        c.force_authenticate(self.users["head"])
        rows = c.get("/api/notifications/").json()["results"]
        keyed = [r for r in rows if r["message_key"] == "report_sent_to_department"]
        legacy = [r for r in rows if r["message"] == "رسالة قديمة"]
        self.assertEqual(len(keyed), 1)
        self.assertEqual(keyed[0]["message_params"]["count"], 1)
        self.assertEqual(legacy[0]["message_key"], "")
        self.assertEqual(legacy[0]["message_params"], {})
