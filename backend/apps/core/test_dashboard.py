"""Role dashboards v2: each block counts exactly what its register link lists."""
import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.models import AuditTrail
from apps.core.testing import (
    drive_to_action_plan_required,
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    submit_to_audit,
)
from apps.workflow import services
from apps.workflow.models import ActionPlan

S = Recommendation.Status


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def backdate_status(rec, days):
    """Pretend the case entered its current status `days` days ago."""
    when = timezone.now() - datetime.timedelta(days=days)
    AuditTrail.objects.filter(recommendation=rec).update(created_at=when)


class DashboardV2Tests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def dashboard(self, user):
        res = client_for(self.users[user]).get("/api/dashboard/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["version"], 2)
        return res.data

    def register_count(self, user, query):
        res = client_for(self.users[user]).get(f"/api/recommendations/?{query}")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["count"]

    # -- audit -------------------------------------------------------------
    def test_report_is_ready_for_council_only_when_every_case_is_approved(self):
        second = Recommendation.objects.create(report=self.report, text="Reconcile daily", risk_level="low")
        services.submit_report_to_department(self.report, self.users["audit"])
        for rec in (self.rec, second):
            rec.refresh_from_db()
            services.submit_response(rec, self.users["head"], decision="agree")
        services.review_response(self.rec, self.users["audit"], accept=True)

        data = self.dashboard("audit")
        self.assertEqual(data["reports_ready_for_council"]["count"], 0)

        second.refresh_from_db()
        services.review_response(second, self.users["audit"], accept=True)
        data = self.dashboard("audit")
        self.assertEqual(data["reports_ready_for_council"]["count"], 1)
        item = data["reports_ready_for_council"]["items"][0]
        self.assertEqual(item["id"], self.report.id)
        self.assertEqual(item["recommendations_count"], 2)

    def test_draft_reports_are_listed_for_audit(self):
        data = self.dashboard("audit")
        self.assertEqual(data["draft_reports"]["count"], 1)
        self.assertEqual(data["draft_reports"]["items"][0]["id"], self.report.id)

    def test_late_in_audit_queue_uses_the_queue_age(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(self.rec, self.users["head"], decision="agree")
        self.assertEqual(self.dashboard("audit")["late_in_audit_queue"]["count"], 0)

        backdate_status(self.rec, 9)
        data = self.dashboard("audit")
        self.assertEqual(data["late_in_audit_queue"]["count"], 1)
        self.assertEqual(data["late_in_audit_queue"]["threshold_days"], 7)
        self.assertEqual(self.register_count("audit", "waiting_on=audit&waiting_over=7"), 1)

    def test_high_risk_stale_and_overdue_by_department(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        ActionPlan.objects.filter(recommendation=self.rec).update(
            target_date=timezone.localdate() - datetime.timedelta(days=3)
        )
        backdate_status(self.rec, 40)
        data = self.dashboard("audit")
        self.assertEqual(data["high_risk_stale"]["count"], 1)
        self.assertEqual(self.register_count("audit", "risk_level=high&open=true&waiting_over=30"), 1)
        finance = next(row for row in data["overdue_by_department"] if row["department"]["id"] == self.dept.id)
        self.assertEqual(finance["overdue"], 1)
        self.assertEqual(finance["open"], 1)
        self.assertEqual(self.register_count("audit", f"overdue=true&report__department={self.dept.id}"), 1)

    # -- department head -----------------------------------------------------
    def test_head_sees_due_soon_waiting_on_others_and_team(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        ActionPlan.objects.filter(recommendation=self.rec).update(
            target_date=timezone.localdate() + datetime.timedelta(days=5)
        )
        data = self.dashboard("head")
        self.assertEqual(data["due_soon"]["count"], 1)
        self.assertEqual(self.register_count("head", "due_within=7"), 1)
        team = {row["employee"]["id"]: row for row in data["team"]}
        self.assertEqual(team[self.users["emp"].id]["open"], 1)
        self.assertEqual(team[self.users["emp2"].id]["open"], 0)

        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        data = self.dashboard("head")
        self.assertEqual(data["waiting_on_others"]["count"], 1)
        self.assertEqual(data["due_soon"]["count"], 0)  # audit owns it now (W2)
        self.assertEqual(self.register_count("head", "waiting_on=audit,council"), 1)

    def test_head_plan_queue_matches_the_status_list(self):
        drive_to_action_plan_required(self.users, self.report, self.rec)
        data = self.dashboard("head")
        self.assertEqual(data["action_center"]["plans_needed"]["count"], 1)
        self.assertEqual(
            self.register_count(
                "head", "status__in=approved_for_implementation,action_plan_required,revision_required"
            ),
            1,
        )

    # -- employee ------------------------------------------------------------
    def test_partial_verification_counts_as_returned_work_for_the_employee(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        services.verify(
            self.rec, self.users["audit"], decision="partial",
            rejected_items="x", rejection_reason="y", required_action="z",
            action_deadline=timezone.localdate() + datetime.timedelta(days=5),
        )
        data = self.dashboard("emp")
        self.assertEqual(data["action_center"]["returned_for_more_evidence"]["count"], 1)
        self.assertEqual(data["action_center"]["upcoming_deadlines"]["count"], 1)
        self.assertEqual(self.register_count("emp", "due_within=30"), 1)
        self.assertEqual(
            self.register_count("emp", "status__in=returned_insufficient,partial,reopened"), 1
        )
        self.assertEqual(data["next_deadline"], timezone.localdate() + datetime.timedelta(days=5))
        # The other employee of the department sees none of it.
        other = self.dashboard("emp2")
        self.assertEqual(other["action_center"]["returned_for_more_evidence"]["count"], 0)
        self.assertEqual(other["active_tasks"]["count"], 0)

    def test_employee_waiting_on_reviewers_is_their_submitted_work(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        services.mark_implemented(self.rec, self.users["emp"])
        data = self.dashboard("emp")
        self.assertEqual(data["waiting_on_others"]["count"], 1)
        self.assertEqual(data["action_center"]["waiting_head_review"]["count"], 1)
        self.assertEqual(
            self.register_count(
                "emp",
                "status__in=pending_head_review,submitted_for_verification,closure_review,pending_closure_council",
            ),
            1,
        )

    # -- council ---------------------------------------------------------------
    def test_council_sees_reopened_cases_and_recent_decisions(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        services.verify_and_submit_for_closure(self.rec, self.users["audit"])
        self.rec.refresh_from_db()
        services.council_closure(self.rec, self.users["council"], accept=False, notes="More proof needed")

        data = self.dashboard("council")
        self.assertEqual(data["reopened"]["count"], 1)
        kinds = [decision["kind"] for decision in data["recent_decisions"]]
        self.assertEqual(kinds[0], "reopened")
        self.assertIn("ratified", kinds)
        reopened = data["recent_decisions"][0]
        self.assertEqual(reopened["recommendation"]["id"], self.rec.id)
        self.assertEqual(reopened["notes"], "More proof needed")

    def test_council_decisions_stay_inside_the_municipality(self):
        from apps.organizations.models import Department, Municipality

        other = Municipality.objects.create(name="Elsewhere")
        dept = Department.objects.create(municipality=other, name="Roads")
        report = AuditReport.objects.create(
            municipality=other, department=dept, title="Roads", engagement_type="assurance",
            created_by=self.users["audit"],
        )
        AuditTrail.objects.create(user=self.users["council"], action="report_ratified_by_council", report=report)
        self.assertEqual(self.dashboard("council")["recent_decisions"], [])

    def test_unknown_waiting_side_is_rejected(self):
        res = client_for(self.users["audit"]).get("/api/recommendations/?waiting_on=audit,nobody")
        self.assertEqual(res.status_code, 400)
