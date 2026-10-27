"""BUG-10: concurrent duplicates of a workflow action.

Ten simultaneous requests to each transition endpoint must produce exactly
one success, the rest 409, no 500, and exactly one audit-trail entry and one
set of notifications for the action.
"""
import threading

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.models import AuditTrail
from apps.core.testing import (
    drive_to_action_plan_required,
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    plan_data,
    submit_to_audit,
)
from apps.notifications.models import Notification
from apps.workflow import services

S = Recommendation.Status
N = 10


class ConcurrentTransitionTests(TransactionTestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def race(self, user, path, body=None, files=False):
        barrier = threading.Barrier(N)
        statuses = []
        lock = threading.Lock()

        def worker():
            client = APIClient()
            client.force_authenticate(self.users[user])
            barrier.wait()
            try:
                data = dict(body or {})
                if files:
                    data["file"] = SimpleUploadedFile("proof.pdf", b"%PDF-1.4 race")
                    res = client.post(path, data, format="multipart")
                else:
                    res = client.post(path, data, format="json")
                code = res.status_code
            except Exception:  # an unhandled server error surfaces here in tests
                code = 500
            finally:
                connection.close()
            with lock:
                statuses.append(code)

        threads = [threading.Thread(target=worker) for _ in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return sorted(statuses)

    def assert_one_success(self, statuses, action=None, rec=None, report=None):
        self.assertEqual(statuses.count(500), 0, statuses)
        successes = [s for s in statuses if s < 300]
        self.assertEqual(len(successes), 1, statuses)
        self.assertTrue(all(s == 409 for s in statuses if s >= 300), statuses)
        if action:
            trail = AuditTrail.objects.filter(action=action)
            if rec is not None:
                trail = trail.filter(recommendation=rec)
            if report is not None:
                trail = trail.filter(report=report)
            self.assertEqual(trail.count(), 1, list(trail.values_list("action", flat=True)))

    def test_submit_report_to_department(self):
        statuses = self.race("audit", f"/api/reports/{self.report.id}/submit-to-department/")
        self.assert_one_success(statuses, "report_submitted_to_department", rec=self.rec)
        self.assertEqual(Notification.objects.filter(user=self.users["head"], report=self.report).count(), 1)

    def test_respond(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        statuses = self.race("head", f"/api/recommendations/{self.rec.id}/respond/", {"decision": "agree"})
        self.assert_one_success(statuses, "management_response_submitted", rec=self.rec)

    def test_review_response(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(self.rec, self.users["head"], decision="agree")
        statuses = self.race("audit", f"/api/recommendations/{self.rec.id}/review/", {"accept": True})
        self.assert_one_success(statuses, "audit_approved_response", rec=self.rec)

    def test_submit_report_to_council(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(self.rec, self.users["head"], decision="agree")
        services.review_response(self.rec, self.users["audit"], accept=True)
        statuses = self.race("audit", f"/api/reports/{self.report.id}/submit-to-council/")
        self.assert_one_success(statuses)
        self.assertEqual(AuditReport.objects.get(id=self.report.id).status, "pending_council")

    def test_ratify(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(self.rec, self.users["head"], decision="agree")
        services.review_response(self.rec, self.users["audit"], accept=True)
        services.submit_report_to_council(self.report, self.users["audit"])
        statuses = self.race("council", f"/api/reports/{self.report.id}/ratify/", {"notes": ""})
        self.assert_one_success(statuses)

    def test_submit_action_plan(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        body = {"responsible_employee": self.users["emp"].id, "target_date": str(plan_data(self.users)["target_date"]),
                "steps": [{"title": "Draft"}]}
        statuses = self.race("head", f"/api/recommendations/{self.rec.id}/action-plan/", body)
        self.assert_one_success(statuses, "action_plan_submitted", rec=self.rec)

    def test_review_action_plan(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        services.submit_action_plan(self.rec, self.users["head"], plan_data(self.users))
        statuses = self.race("audit", f"/api/recommendations/{self.rec.id}/action-plan/review/", {"accept": True})
        self.assert_one_success(statuses)

    def test_mark_implemented(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        statuses = self.race("emp", f"/api/recommendations/{self.rec.id}/mark-implemented/")
        self.assert_one_success(statuses)

    def test_review_implementation(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        services.mark_implemented(self.rec, self.users["emp"])
        statuses = self.race("head", f"/api/recommendations/{self.rec.id}/review-implementation/", {"accept": True})
        self.assert_one_success(statuses)

    def test_verify(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        statuses = self.race("audit", f"/api/recommendations/{self.rec.id}/verify/", {"decision": "sufficient"})
        self.assert_one_success(statuses)
        self.assertEqual(self.rec.verifications.count(), 1)

    def test_submit_for_closure(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        services.verify(self.rec, self.users["audit"], decision="sufficient")
        statuses = self.race("audit", f"/api/recommendations/{self.rec.id}/submit-for-closure/", {"notes": "ok"})
        self.assert_one_success(statuses)

    def test_council_closure(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        submit_to_audit(self.users, self.rec)
        services.verify(self.rec, self.users["audit"], decision="sufficient")
        self.rec.refresh_from_db()
        services.submit_for_closure(self.rec, self.users["audit"], notes="ok")
        statuses = self.race("council", f"/api/recommendations/{self.rec.id}/council-closure/", {"accept": True, "notes": "ok"})
        self.assert_one_success(statuses)

    def test_confirm_recurrence(self):
        Recommendation.objects.filter(id=self.rec.id).update(is_recurring=True)
        statuses = self.race("audit", f"/api/recommendations/{self.rec.id}/confirm-recurrence/", {"confirmed": True})
        self.assert_one_success(statuses, "recurrence_reviewed", rec=self.rec)

    def test_delete_evidence(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        ev = self.rec.evidence_files.first()
        statuses = self.race("emp", f"/api/recommendations/{self.rec.id}/evidence/{ev.id}/delete/")
        self.assertEqual(statuses.count(500), 0, statuses)
        self.assertEqual(len([s for s in statuses if s < 300]), 1, statuses)
