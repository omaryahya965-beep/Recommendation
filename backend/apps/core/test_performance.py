"""Payload and query-shape guarantees from the V2 performance work."""
import datetime
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import drive_to_in_progress, make_world
from apps.workflow.models import ActionPlan


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class ListPayloadTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.rec.text = "العنوان:\nعنوان قصير\nالوضع القائم:\n" + "نص طويل " * 400
        self.rec.save()

    def test_list_rows_carry_a_title_not_the_full_text(self):
        row = client_for(self.users["audit"]).get("/api/recommendations/").data["results"][0]
        self.assertNotIn("text", row)
        self.assertEqual(row["title"], "عنوان قصير")
        self.assertLessEqual(len(row["excerpt"]), 201)

    def test_detail_keeps_the_full_text(self):
        detail = client_for(self.users["audit"]).get(f"/api/recommendations/{self.rec.id}/").data
        self.assertEqual(detail["text"], self.rec.text)


class TeamWorkloadTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        ActionPlan.objects.filter(recommendation=self.rec).update(
            target_date=timezone.localdate() - datetime.timedelta(days=2)
        )

    def test_head_sees_exact_counts_per_employee(self):
        data = client_for(self.users["head"]).get("/api/team/workload/").data
        self.assertEqual(data["department"]["id"], self.dept.id)
        by_name = {row["employee"]["id"]: row for row in data["employees"]}
        emp = by_name[self.users["emp"].id]
        self.assertEqual((emp["open"], emp["active"], emp["overdue"]), (1, 1, 1))
        self.assertEqual(emp["items"][0]["id"], self.rec.id)
        # Employees without cases are listed too, with zero load.
        self.assertEqual(by_name[self.users["emp2"].id]["open"], 0)

    def test_counts_are_not_capped_by_the_item_list(self):
        report = AuditReport.objects.create(
            municipality=self.muni, department=self.dept, title="Bulk",
            engagement_type="assurance", created_by=self.users["audit"],
            status=AuditReport.Status.RATIFIED,
        )
        for index in range(12):
            rec = Recommendation.objects.create(
                report=report, text=f"bulk {index}", risk_level="low", status=Recommendation.Status.IN_PROGRESS
            )
            ActionPlan.objects.create(
                recommendation=rec, responsible_employee=self.users["emp"],
                submitted_by=self.users["head"], target_date=timezone.localdate(),
            )
        data = client_for(self.users["head"]).get("/api/team/workload/").data
        emp = next(row for row in data["employees"] if row["employee"]["id"] == self.users["emp"].id)
        self.assertEqual(emp["open"], 13)
        self.assertEqual(len(emp["items"]), data["item_limit"])

    def test_audit_must_name_a_department(self):
        client = client_for(self.users["audit"])
        self.assertEqual(client.get("/api/team/workload/").status_code, 400)
        self.assertEqual(client.get(f"/api/team/workload/?department={self.dept.id}").status_code, 200)

    def test_employees_and_council_are_refused(self):
        for who in ("emp", "council"):
            self.assertEqual(client_for(self.users[who]).get("/api/team/workload/").status_code, 403)

    def test_other_municipality_department_is_not_found(self):
        from apps.organizations.models import Department, Municipality

        other = Department.objects.create(municipality=Municipality.objects.create(name="Far"), name="X")
        res = client_for(self.users["audit"]).get(f"/api/team/workload/?department={other.id}")
        self.assertEqual(res.status_code, 404)


class AIRunnerTests(TestCase):
    def test_run_job_never_sleeps_in_the_request(self):
        from apps.ai.services.common import run_job

        muni, dept, users, report, rec = make_world()
        with mock.patch("apps.ai.services.common.time.sleep", side_effect=AssertionError("slept")):
            for _ in range(2):
                job = run_job(user=users["audit"], job_type="probe", target_type="recommendation",
                              target_id=rec.id, fn=lambda: None)
                self.assertEqual(job.status, "completed")
