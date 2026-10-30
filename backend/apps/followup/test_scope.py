"""S11: follow-up report visibility per role."""
import json

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.testing import make_world
from apps.followup.services import generate_followup_report
from apps.workflow import services


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class FollowUpScopeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.other_dept = self.users["other_head"].department
        other_report = AuditReport.objects.create(
            municipality=self.muni, department=self.other_dept, title="Engineering secret audit",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        self.other_rec = Recommendation.objects.create(
            report=other_report, text="Engineering-only finding XYZZY", risk_level="high"
        )
        for report in (self.report, other_report):
            services.submit_report_to_department(report, self.users["audit"])
        from django.utils import timezone

        today = timezone.localdate()
        self.followup = generate_followup_report(self.muni, self.users["audit"], today.replace(day=1), today)

    def get(self, who, path=None):
        return client_for(self.users[who]).get(path or f"/api/followup-reports/{self.followup.id}/")

    def test_audit_and_council_see_the_whole_municipality(self):
        for who in ("audit", "council"):
            body = self.get(who).json()
            ids = {item["id"] for item in body["snapshot"]["items"]}
            self.assertEqual(ids, {self.rec.id, self.other_rec.id}, who)

    def test_department_head_sees_only_own_department(self):
        res = self.get("head")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        snapshot = body["snapshot"]
        self.assertEqual({item["id"] for item in snapshot["items"]}, {self.rec.id})
        self.assertEqual([row["department"] for row in snapshot["departments"]], [self.dept.id])
        self.assertEqual(snapshot["totals"]["total"], 1)
        self.assertEqual(snapshot["scope"], "department")
        text = json.dumps(body, ensure_ascii=False)
        self.assertNotIn("XYZZY", text)
        self.assertNotIn("Engineering", text)
        self.assertIsNone(body["executive_summary"])

    def test_department_head_list_is_scoped_too(self):
        body = self.get("head", "/api/followup-reports/").json()
        text = json.dumps(body, ensure_ascii=False)
        self.assertNotIn("XYZZY", text)
        self.assertNotIn("Engineering", text)

    def test_employee_has_no_access(self):
        self.assertEqual(self.get("emp").status_code, 403)
        self.assertEqual(self.get("emp", "/api/followup-reports/").status_code, 403)

    def test_other_municipality_cannot_read(self):
        from apps.accounts.models import User
        from apps.organizations.models import Municipality

        other = Municipality.objects.create(name="Elsewhere")
        stranger = User.objects.create_user("aud_x", password="x", role=User.Role.AUDIT, municipality=other)
        self.assertEqual(client_for(stranger).get(f"/api/followup-reports/{self.followup.id}/").status_code, 404)


    def test_assistant_tool_gives_a_head_department_totals_only(self):
        from apps.ai.services.assistant.tools import tool_get_followup_reports

        head_rows = tool_get_followup_reports(self.users["head"])
        audit_rows = tool_get_followup_reports(self.users["audit"])
        self.assertEqual(head_rows[0]["totals"]["total"], 1)
        self.assertEqual(audit_rows[0]["totals"]["total"], 2)
