"""The analytics cache must never cross scopes and never outlive a change.

Analytics are cached per scope for a short TTL. These tests pin the two
properties that make that safe for an internal-control system: a user only
ever receives aggregates computed for their own scope, and any write to the
underlying data is visible on the very next request.
"""
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.permissions import recommendation_scope_key
from apps.workflow.models import ActionPlan
from apps.workflow.tests import make_world

S = Recommendation.Status


class AnalyticsCacheTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.report.status = AuditReport.Status.RATIFIED
        self.report.save(update_fields=["status"])
        self.rec.status = S.IN_PROGRESS
        self.rec.save(update_fields=["status"])
        ActionPlan.objects.create(
            recommendation=self.rec,
            responsible_employee=self.users["emp"],
            submitted_by=self.users["head"],
            target_date=timezone.localdate(),
        )
        self.client = APIClient()

    def _totals(self, user):
        self.client.force_authenticate(user)
        res = self.client.get("/api/analytics/")
        self.assertEqual(res.status_code, 200)
        return res.data["totals"]

    def test_second_request_in_same_scope_is_served_from_cache(self):
        self._totals(self.users["audit"])
        with CaptureQueriesContext(connection) as ctx:
            self._totals(self.users["audit"])
        aggregates = [q for q in ctx.captured_queries if "COUNT(" in q["sql"].upper()]
        self.assertEqual(aggregates, [])

    def test_department_heads_never_share_an_entry(self):
        # Warm the cache for the head who owns the finding first.
        self.assertEqual(self._totals(self.users["head"])["total"], 1)
        self.assertEqual(self._totals(self.users["other_head"])["total"], 0)

    def test_employees_never_share_an_entry(self):
        self.assertEqual(self._totals(self.users["emp"])["total"], 1)
        self.assertEqual(self._totals(self.users["emp2"])["total"], 0)

    def test_audit_drafts_never_reach_council_through_the_cache(self):
        draft_report = AuditReport.objects.create(
            municipality=self.muni, department=self.dept, title="Draft",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        Recommendation.objects.create(report=draft_report, text="Unissued", risk_level="low")
        self.assertEqual(self._totals(self.users["audit"])["total"], 2)
        self.assertEqual(self._totals(self.users["council"])["total"], 1)

    def test_new_recommendation_is_visible_immediately(self):
        self.assertEqual(self._totals(self.users["audit"])["total"], 1)
        Recommendation.objects.create(report=self.report, text="Another", risk_level="low")
        self.assertEqual(self._totals(self.users["audit"])["total"], 2)

    def test_status_change_is_visible_immediately(self):
        self.assertEqual(self._totals(self.users["audit"])["closed"], 0)
        self.rec.status = S.CLOSED
        self.rec.save(update_fields=["status"])
        self.assertEqual(self._totals(self.users["audit"])["closed"], 1)

    def test_plan_date_change_updates_overdue_immediately(self):
        self.assertEqual(self._totals(self.users["audit"])["overdue"], 0)
        plan = self.rec.action_plan
        plan.target_date = timezone.localdate() - timezone.timedelta(days=3)
        plan.save(update_fields=["target_date"])
        self.assertEqual(self._totals(self.users["audit"])["overdue"], 1)

    def test_department_move_changes_the_heads_scope(self):
        head = self.users["head"]
        self.assertEqual(self._totals(head)["total"], 1)
        head.department = self.users["other_head"].department
        head.save(update_fields=["department"])
        self.assertEqual(self._totals(head)["total"], 0)


class ScopeKeyTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, *_ = make_world()

    def test_same_scope_same_key(self):
        other_audit = User.objects.create_user(
            "aud2", password="x", role=User.Role.AUDIT, municipality=self.muni
        )
        self.assertEqual(
            recommendation_scope_key(self.users["audit"]),
            recommendation_scope_key(other_audit),
        )

    def test_different_scopes_different_keys(self):
        keys = {recommendation_scope_key(user) for user in self.users.values()}
        # audit, head, other_head, emp, emp2, council: six distinct scopes.
        self.assertEqual(len(keys), 6)
