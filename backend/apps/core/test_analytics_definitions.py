"""Each analytics number means exactly what apps/core/analytics.py says."""
import datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.analytics import build_analytics
from apps.core.models import AuditTrail
from apps.core.testing import (
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    submit_to_audit,
)
from apps.workflow import services
from apps.workflow.models import ActionPlan, ActionStep

S = Recommendation.Status
TODAY = timezone.localdate


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def months_ago(n):
    first = TODAY().replace(day=1)
    month, year = first.month - n, first.year
    while month <= 0:
        month += 12
        year -= 1
    return first.replace(year=year, month=month)


def close(users, rec):
    finish_steps_and_evidence(users, rec)
    rec.refresh_from_db()
    submit_to_audit(users, rec)
    rec.refresh_from_db()
    services.verify_and_submit_for_closure(rec, users["audit"])
    rec.refresh_from_db()
    services.council_closure(rec, users["council"], accept=True)
    rec.refresh_from_db()


class AnalyticsDefinitionTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def analytics(self, user="audit"):
        res = client_for(self.users[user]).get("/api/analytics/")
        self.assertEqual(res.status_code, 200)
        return res.data

    def test_dashboard_and_analytics_agree(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        Recommendation.objects.create(report=self.report, text="draft", risk_level="low")
        for user in ("audit", "head", "council"):
            dashboard = client_for(self.users[user]).get("/api/dashboard/").data["stats"]
            totals = self.analytics(user)["totals"]
            for key in ("total", "open", "closed", "overdue", "completion_rate"):
                self.assertEqual(dashboard[key], totals[key], f"{user}: {key}")

    def test_drafts_are_reported_apart_and_never_in_rates(self):
        Recommendation.objects.create(report=self.report, text="draft two", risk_level="low")
        totals = self.analytics()["totals"]
        self.assertEqual(totals["total"], 0)
        self.assertEqual(totals["drafts"], 2)
        self.assertEqual(totals["completion_rate"], 0.0)
        self.assertNotIn("draft", self.analytics()["by_status"])

    def test_created_and_closed_per_month_use_their_own_dates(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        close(self.users, self.rec)
        created = timezone.make_aware(datetime.datetime.combine(months_ago(2), datetime.time(12)))
        Recommendation.objects.filter(pk=self.rec.pk).update(created_at=created)
        volume = {row["month"]: row for row in self.analytics()["volume"]}
        self.assertEqual(volume[months_ago(2).isoformat()]["created"], 1)
        self.assertEqual(volume[months_ago(2).isoformat()]["closed"], 0)
        self.assertEqual(volume[months_ago(0).isoformat()]["closed"], 1)
        self.assertEqual(volume[months_ago(0).isoformat()]["created"], 0)
        self.assertEqual(len(volume), 12)

    def test_overdue_rate_counts_only_cases_with_a_binding_deadline(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        ActionPlan.objects.filter(recommendation=self.rec).update(
            target_date=TODAY() - datetime.timedelta(days=3)
        )
        other = AuditReport.objects.create(
            municipality=self.muni, department=self.dept, title="Waiting",
            engagement_type="assurance", created_by=self.users["audit"],
        )
        Recommendation.objects.create(report=other, text="x", risk_level="low")
        services.submit_report_to_department(other, self.users["audit"])  # no deadline yet
        totals = self.analytics()["totals"]
        self.assertEqual(totals["open"], 2)
        self.assertEqual(totals["overdue"], 1)
        self.assertEqual(totals["overdue_rate"], 100.0)

    def test_department_high_risk_counts_open_cases_only(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        close(self.users, self.rec)
        row = self.analytics()["by_department"][0]
        self.assertEqual(row["high_risk"], 0)
        self.assertEqual(self.analytics()["totals"]["high_risk_open"], 0)

    def test_execution_rate_excludes_accepted_disagreements(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(
            self.rec, self.users["head"], decision="disagree", justification="no",
            attachment=SimpleUploadedFile("why.pdf", b"%PDF-1.4"),
        )
        services.review_response(self.rec, self.users["audit"], accept=True)
        services.submit_report_to_council(self.report, self.users["audit"])
        services.ratify_report(self.report, self.users["council"])
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.resolution, "disagreement_accepted")
        row = self.analytics()["by_department"][0]
        self.assertEqual(row["closed"], 1)
        self.assertEqual(row["execution_rate"], 0.0)  # 0 / 0, not 1 / 1

    def test_average_progress_ignores_closed_cases(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        steps = list(ActionStep.objects.filter(plan__recommendation=self.rec).order_by("order"))
        services.update_step_progress(self.rec, steps[0], self.users["emp"], progress_percent=50)
        implementation = self.analytics()["implementation"]
        self.assertEqual(implementation["average_step_progress"], 25.0)
        self.assertEqual(implementation["cases_in_execution"], 1)

    def test_queue_age_and_overdue_aging(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        ActionPlan.objects.filter(recommendation=self.rec).update(
            target_date=TODAY() - datetime.timedelta(days=40)
        )
        AuditTrail.objects.filter(recommendation=self.rec, metadata__to_status=S.IN_PROGRESS).update(
            created_at=timezone.now() - datetime.timedelta(days=12)
        )
        data = self.analytics()
        self.assertEqual(data["queues"]["department"]["count"], 1)
        self.assertEqual(data["queues"]["department"]["max_days"], 12)
        self.assertEqual(data["overdue_aging"]["31-90"], 1)

    def test_council_reopen_rate(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        self.rec.refresh_from_db()
        services.verify_and_submit_for_closure(self.rec, self.users["audit"])
        self.rec.refresh_from_db()
        services.council_closure(self.rec, self.users["council"], accept=False, notes="more")
        decisions = self.analytics()["decisions"]
        self.assertEqual(decisions["reopened"], 1)
        self.assertEqual(decisions["reopen_rate"], 100.0)

    def test_build_analytics_is_scope_agnostic(self):
        payload = build_analytics(Recommendation.objects.none())
        self.assertEqual(payload["totals"]["total"], 0)
        self.assertEqual(payload["definitions_version"], 2)
