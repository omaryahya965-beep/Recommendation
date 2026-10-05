"""Follow-up reports describe the register as it stood at the period end.

Each test drives cases through the real workflow services, then moves the
recorded transitions back in time (`at()`), so the audit trail tells a known
story: "issued 10 Feb, plan due 20 Mar, submitted 5 Apr" and so on.
"""
import datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from apps.audits.models import AuditReport, Recommendation
from apps.core.models import AuditTrail
from apps.core.testing import (
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    submit_to_audit,
)
from apps.followup.services import build_followup_snapshot
from apps.workflow import services
from apps.workflow.models import ActionPlan, VerificationDecision

S = Recommendation.Status
YEAR = timezone.localdate().year - 1
MARCH_START = datetime.date(YEAR, 3, 1)
MARCH_END = datetime.date(YEAR, 3, 31)


def moment(month, day, hour=12, minute=0):
    return timezone.make_aware(datetime.datetime(YEAR, month, day, hour, minute))


def at(rec, actions, when):
    """Move these audit-trail entries of `rec` to `when`."""
    AuditTrail.objects.filter(recommendation=rec, action__in=actions).update(created_at=when)


def set_plan_target(rec, target):
    """The plan's target date as the department submitted it: on the plan and
    in the audit-trail entry that recorded the submission."""
    ActionPlan.objects.filter(recommendation=rec).update(target_date=target)
    for entry in AuditTrail.objects.filter(recommendation=rec, action="action_plan_submitted"):
        metadata = dict(entry.metadata, target_date=str(target))
        AuditTrail.objects.filter(pk=entry.pk).update(metadata=metadata)


def item_for(snapshot, rec):
    return next((item for item in snapshot["items"] if item["id"] == rec.id), None)


ISSUE = ["report_submitted_to_department"]
RESPONSE = ["management_response_submitted"]
AUDIT_OK = ["audit_approved_response"]
RATIFY = ["council_ratification", "action_plan_requested"]
PLAN = ["action_plan_submitted", "action_plan_submitted_for_review"]
PLAN_OK = ["action_plan_approved", "execution_started"]


class AsOfStatusTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def place_in_progress(self, target, issued=moment(2, 10)):
        """Issued on `issued`, in progress from 1 March, plan due `target`."""
        drive_to_in_progress(self.users, self.report, self.rec)
        set_plan_target(self.rec, target)
        at(self.rec, ISSUE, issued)
        at(self.rec, RESPONSE + AUDIT_OK, issued + datetime.timedelta(days=3))
        at(self.rec, RATIFY, issued + datetime.timedelta(days=6))
        at(self.rec, PLAN, issued + datetime.timedelta(days=9))
        at(self.rec, PLAN_OK, moment(3, 1))
        self.rec.refresh_from_db()

    def test_status_is_the_one_in_force_at_period_end_not_today(self):
        self.place_in_progress(target=datetime.date(YEAR, 6, 30))
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)  # happens "today", after March
        self.assertEqual(Recommendation.objects.get(pk=self.rec.pk).status, S.SUBMITTED_FOR_VERIFICATION)

        item = item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec)
        self.assertEqual(item["status"], S.IN_PROGRESS)
        self.assertEqual(item["status_now"], S.SUBMITTED_FOR_VERIFICATION)
        self.assertEqual(item["stage"], "execution")

    def test_overdue_at_period_end_stays_overdue_in_that_report(self):
        self.place_in_progress(target=datetime.date(YEAR, 3, 20))
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)  # now waiting on audit: not overdue today

        snapshot = build_followup_snapshot(self.muni, MARCH_START, MARCH_END)
        item = item_for(snapshot, self.rec)
        self.assertTrue(item["overdue"])
        self.assertEqual(item["days_overdue"], 11)  # 20 -> 31 March
        self.assertTrue(item["became_overdue"])
        self.assertEqual(snapshot["totals"]["overdue"], 1)
        self.assertEqual(snapshot["totals"]["became_overdue_in_period"], 1)

    def test_due_on_the_last_day_is_not_overdue(self):
        self.place_in_progress(target=MARCH_END)
        item = item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec)
        self.assertFalse(item["overdue"])

    def test_issued_after_the_period_is_excluded(self):
        """The old bug: a draft created in February but issued in April was
        reported for March with today's status."""
        Recommendation.objects.filter(pk=self.rec.pk).update(
            created_at=moment(2, 1)
        )
        services.submit_report_to_department(self.report, self.users["audit"])
        at(self.rec, ISSUE, moment(4, 5))
        self.assertIsNone(item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec))

    def test_transition_at_23_59_on_the_last_day_counts(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        at(self.rec, ISSUE, moment(3, 31, 23, 59))
        item = item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec)
        self.assertIsNotNone(item)
        self.assertEqual(item["status"], S.PENDING_RESPONSE)
        self.assertTrue(item["issued_in_period"])

    def test_returned_twice_reports_the_state_at_the_end(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        at(self.rec, ISSUE, moment(2, 1))
        for day in (3, 10):
            services.submit_response(self.rec, self.users["head"], decision="agree")
            self.rec.refresh_from_db()
            services.review_response(self.rec, self.users["audit"], accept=False, notes="أعد")
            self.rec.refresh_from_db()
            at(self.rec, RESPONSE + ["audit_rejected_response"], moment(3, day))
        services.submit_response(self.rec, self.users["head"], decision="agree")
        self.rec.refresh_from_db()
        # The third response only arrives in April.
        AuditTrail.objects.filter(
            recommendation=self.rec, action="management_response_submitted"
        ).order_by("-id").filter(pk=AuditTrail.objects.filter(
            recommendation=self.rec, action="management_response_submitted"
        ).order_by("-id").values("pk")[:1]).update(created_at=moment(4, 2))

        item = item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec)
        self.assertEqual(item["status"], S.RETURNED_FOR_REVISION)


class AsOfClosureTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        self.rec.refresh_from_db()
        services.verify(self.rec, self.users["audit"], decision="sufficient")
        self.rec.refresh_from_db()
        services.submit_for_closure(self.rec, self.users["audit"])
        self.rec.refresh_from_db()
        services.council_closure(self.rec, self.users["council"], accept=True)
        self.rec.refresh_from_db()
        AuditTrail.objects.filter(recommendation=self.rec).update(created_at=moment(1, 15))

    def close_on(self, when):
        at(self.rec, ["council_closed_recommendation"], when)
        Recommendation.objects.filter(pk=self.rec.pk).update(closed_at=when)

    def test_closed_inside_the_period(self):
        self.close_on(moment(3, 12))
        snapshot = build_followup_snapshot(self.muni, MARCH_START, MARCH_END)
        item = item_for(snapshot, self.rec)
        self.assertEqual(item["status"], S.CLOSED)
        self.assertTrue(item["closed_in_period"])
        self.assertEqual(item["resolution"], "implemented")
        self.assertEqual(snapshot["totals"]["closed_in_period"], 1)
        self.assertEqual(snapshot["totals"]["closed_implemented_in_period"], 1)

    def test_closed_before_the_period_is_excluded(self):
        self.close_on(moment(2, 20))
        self.assertIsNone(item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec))

    def test_closed_after_the_period_is_still_open_in_it(self):
        self.close_on(moment(4, 3))
        snapshot = build_followup_snapshot(self.muni, MARCH_START, MARCH_END)
        item = item_for(snapshot, self.rec)
        self.assertEqual(item["status"], S.PENDING_CLOSURE_COUNCIL)
        self.assertFalse(item["closed_in_period"])
        self.assertEqual(snapshot["totals"]["open_at_end"], 1)
        self.assertEqual(snapshot["totals"]["closed"], 0)


class AsOfDeadlineRulesTests(TestCase):
    """W1 and W2 as of the period end."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        set_plan_target(self.rec, datetime.date(YEAR, 3, 5))
        AuditTrail.objects.filter(recommendation=self.rec).update(created_at=moment(2, 1))
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        self.rec.refresh_from_db()
        at(self.rec, ["step_progress_updated", "marked_implemented", "implementation_submitted_to_audit"],
           moment(3, 2))

    def test_waiting_on_audit_at_period_end_is_late_in_review_not_overdue(self):
        snapshot = build_followup_snapshot(self.muni, MARCH_START, MARCH_END)
        item = item_for(snapshot, self.rec)
        self.assertEqual(item["status"], S.SUBMITTED_FOR_VERIFICATION)
        self.assertFalse(item["overdue"])
        self.assertTrue(item["late_in_review"])
        self.assertEqual(snapshot["totals"]["late_in_review"], 1)

    def test_verification_deadline_binds_returned_work_as_of_the_period(self):
        services.verify(
            self.rec, self.users["audit"], decision="partial",
            rejected_items="x", rejection_reason="y", required_action="z",
            action_deadline=timezone.localdate() + datetime.timedelta(days=1),
        )
        at(self.rec, ["verified_partial"], moment(3, 10))
        VerificationDecision.objects.filter(recommendation=self.rec).update(
            created_at=moment(3, 10), action_deadline=datetime.date(YEAR, 3, 25)
        )
        item = item_for(build_followup_snapshot(self.muni, MARCH_START, MARCH_END), self.rec)
        self.assertEqual(item["status"], S.PARTIAL)
        self.assertEqual(item["deadline"], f"{YEAR}-03-25")
        self.assertEqual(item["deadline_source"], "verification")
        self.assertTrue(item["overdue"])
        self.assertEqual(item["days_overdue"], 6)
        self.assertEqual(item["target_date"], f"{YEAR}-03-05")  # plan date kept


class AsOfEdgeCaseTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_cases_without_status_history_are_flagged(self):
        AuditReport.objects.filter(pk=self.report.pk).update(status=AuditReport.Status.PENDING_RESPONSE)
        Recommendation.objects.filter(pk=self.rec.pk).update(status=S.PENDING_RESPONSE, created_at=moment(2, 1))
        snapshot = build_followup_snapshot(self.muni, MARCH_START, MARCH_END)
        item = item_for(snapshot, self.rec)
        self.assertTrue(item["history_incomplete"])
        self.assertEqual(snapshot["totals"]["history_incomplete"], 1)

    def test_a_period_that_has_not_ended_is_reported_as_of_now(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        today = timezone.localdate()
        snapshot = build_followup_snapshot(self.muni, today - datetime.timedelta(days=3), today + datetime.timedelta(days=30))
        self.assertEqual(snapshot["as_of_date"], today.isoformat())
        self.assertIsNotNone(item_for(snapshot, self.rec))

    def test_snapshot_carries_methodology_and_department_table(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        snapshot = build_followup_snapshot(self.muni, timezone.localdate(), timezone.localdate())
        self.assertEqual(snapshot["methodology_version"], 2)
        self.assertIn("as_of", snapshot)
        row = snapshot["departments"][0]
        for key in ("name", "total", "open", "closed_in_period", "overdue", "overdue_rate",
                    "median_days_overdue", "execution_rate"):
            self.assertIn(key, row)
        self.assertEqual(snapshot["by_department"], {"Finance": 1})
        self.assertNotIn("text", snapshot["items"][0])  # title/excerpt, not the full blob

    def test_drafts_never_appear(self):
        self.assertEqual(build_followup_snapshot(self.muni, MARCH_START, timezone.localdate())["items"], [])

    def test_evidence_upload_after_return_is_reported_on_the_right_day(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        services.add_evidence(
            self.rec, self.users["emp"], file=SimpleUploadedFile("a.pdf", b"%PDF-1.4"), notes="n"
        )
        self.assertIsNotNone(item_for(build_followup_snapshot(self.muni, timezone.localdate(), timezone.localdate()), self.rec))
