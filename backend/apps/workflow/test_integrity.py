"""Audit-trail integrity and validation regressions (BUG-28, BUG-13, BUG-01, BUG-29)."""
import datetime

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.exceptions import WorkflowError
from apps.core.testing import (
    drive_to_action_plan_required,
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    plan_data,
    submit_to_audit,
)
from apps.notifications.models import Notification, ReminderRule, ReminderRun
from apps.notifications.services import run_reminders
from apps.workflow import services


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class AssessedEvidenceTests(TestCase):
    """BUG-28: evidence Internal Audit has assessed cannot be deleted."""

    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.assessed = self.rec.evidence_files.get()
        submit_to_audit(self.users, self.rec)
        services.verify(
            self.rec, self.users["audit"], decision="partial", notes="one month missing",
            rejected_items="Feb", rejection_reason="missing", required_action="add Feb",
            action_deadline=timezone.localdate() + datetime.timedelta(days=10),
        )
        self.rec.refresh_from_db()

    def test_assessed_file_is_locked_after_a_partial_verification(self):
        res = client_for(self.users["emp"]).post(
            f"/api/recommendations/{self.rec.id}/evidence/{self.assessed.id}/delete/"
        )
        self.assertEqual(res.status_code, 409, res.content)
        self.assertEqual(res.json()["code"], "evidence_assessed")
        self.assertTrue(self.rec.evidence_files.filter(id=self.assessed.id).exists())

    def test_api_reports_can_delete_false_for_assessed_and_true_for_new(self):
        services.add_evidence(
            self.rec, self.users["emp"], file=SimpleUploadedFile("new.pdf", b"%PDF-1.4 new"), notes="new"
        )
        files = client_for(self.users["emp"]).get(f"/api/recommendations/{self.rec.id}/").json()["evidence_files"]
        by_id = {f["id"]: f["can_delete"] for f in files}
        self.assertFalse(by_id[self.assessed.id])
        self.assertTrue([v for k, v in by_id.items() if k != self.assessed.id][0])

    def test_head_cannot_delete_assessed_file_either(self):
        res = client_for(self.users["head"]).post(
            f"/api/recommendations/{self.rec.id}/evidence/{self.assessed.id}/delete/"
        )
        self.assertEqual(res.status_code, 409)


class PlanDateTests(TestCase):
    """BUG-13: plan target dates and report response deadlines are sane."""

    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_plan_target_date_in_the_past_is_refused(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        data = plan_data(self.users, days=-1)
        with self.assertRaises(WorkflowError) as ctx:
            services.submit_action_plan(self.rec, self.users["head"], data)
        self.assertEqual(ctx.exception.code, "target_date_in_past")

    def test_plan_target_date_far_in_the_future_is_refused(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        with self.assertRaises(WorkflowError) as ctx:
            services.submit_action_plan(self.rec, self.users["head"], plan_data(self.users, days=365 * 6))
        self.assertEqual(ctx.exception.code, "target_date_too_far")

    def test_plan_target_date_today_is_allowed(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        services.submit_action_plan(self.rec, self.users["head"], plan_data(self.users, days=0))

    def test_report_response_deadline_bounds(self):
        c = client_for(self.users["audit"])
        base = {"title": "Deadline check", "department": self.dept.id, "engagement_type": "assurance"}
        past = c.post("/api/reports/", {**base, "response_deadline": "2000-01-01"}, format="json")
        self.assertEqual(past.status_code, 400)
        self.assertEqual(past.json()["field_codes"]["response_deadline"], ["date_in_past"])
        far = c.post("/api/reports/", {**base, "title": "far", "response_deadline": "2099-01-01"}, format="json")
        self.assertEqual(far.json()["field_codes"]["response_deadline"], ["date_too_far"])
        ok = c.post("/api/reports/", {**base, "title": "ok", "response_deadline": str(timezone.localdate())}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)

    def test_existing_past_deadline_does_not_block_other_edits(self):
        from apps.audits.models import AuditReport

        AuditReport.objects.filter(id=self.report.id).update(response_deadline=datetime.date(2001, 1, 1))
        res = client_for(self.users["audit"]).patch(
            f"/api/reports/{self.report.id}/", {"title": "Renamed", "response_deadline": "2001-01-01"}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.content)


class ReminderRobustnessTests(TestCase):
    """BUG-01: offsets are bounded and one bad rule never stops the run."""

    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        plan = self.rec.action_plan
        plan.target_date = timezone.localdate() - datetime.timedelta(days=3)
        plan.save()

    def test_serializer_rejects_offsets_beyond_a_year(self):
        c = client_for(self.users["audit"])
        for offset in (366, -366, 3000000):
            res = c.post("/api/reminder-rules/", {"offset_days": offset, "recipient_role": "employee"}, format="json")
            self.assertEqual(res.status_code, 400, (offset, res.content))
        ok = c.post("/api/reminder-rules/", {"offset_days": 365, "recipient_role": "employee"}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)

    def test_a_pre_existing_bad_rule_is_skipped_and_others_still_send(self):
        ReminderRule.objects.create(municipality=self.muni, offset_days=1, recipient_role="employee")
        ReminderRule.objects.create(municipality=self.muni, offset_days=3000000, recipient_role="department_head")
        sent = run_reminders()
        self.assertGreaterEqual(sent, 1)
        self.assertTrue(Notification.objects.filter(user=self.users["emp"], recommendation=self.rec).exists())
        run = ReminderRun.objects.latest("started_at")
        self.assertEqual(run.status, ReminderRun.Status.OK)
        self.assertIn("skipped", run.error)

    def test_a_failing_municipality_does_not_stop_the_others(self):
        from unittest import mock

        from apps.notifications import services as reminder_services

        ReminderRule.objects.create(municipality=self.muni, offset_days=1, recipient_role="employee")
        real_cases = reminder_services._cases
        from apps.organizations.models import Municipality

        broken = Municipality.objects.create(name="Broken City")
        ReminderRule.objects.create(municipality=broken, offset_days=1, recipient_role="employee")

        def cases(municipality):
            if municipality.id == broken.id:
                raise RuntimeError("boom")
            return real_cases(municipality)

        with mock.patch.object(reminder_services, "_cases", side_effect=cases):
            sent = run_reminders()
        self.assertGreaterEqual(sent, 1)
        run = ReminderRun.objects.latest("started_at")
        self.assertEqual(run.status, ReminderRun.Status.FAILED)
        self.assertIn("Broken City", run.error)


class TextLengthTests(TestCase):
    """BUG-29: free text has an upper bound with a translatable code."""

    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_recommendation_text_and_root_cause_are_bounded(self):
        c = client_for(self.users["audit"])
        res = c.post(
            "/api/recommendations/",
            {"report": self.report.id, "text": "ن" * 20001, "risk_level": "low"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["field_codes"]["text"], ["max_length"])
        res = c.post(
            "/api/recommendations/",
            {"report": self.report.id, "text": "ok", "root_cause": "x" * 5001, "risk_level": "low"},
            format="json",
        )
        self.assertEqual(res.json()["field_codes"]["root_cause"], ["max_length"])
        ok = c.post("/api/recommendations/", {"report": self.report.id, "text": "ن" * 20000, "risk_level": "low"}, format="json")
        self.assertEqual(ok.status_code, 201)

    def test_workflow_notes_are_bounded(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        res = client_for(self.users["head"]).post(
            f"/api/recommendations/{self.rec.id}/respond/",
            {"decision": "agree", "justification": "x" * 5001},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["field_codes"]["justification"], ["max_length"])
