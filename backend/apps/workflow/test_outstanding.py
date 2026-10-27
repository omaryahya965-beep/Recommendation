"""BUG-15: the reason a case came back is shown to the people who must act."""
import datetime

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.testing import drive_to_in_progress, finish_steps_and_evidence, make_world, submit_to_audit
from apps.workflow import services
from apps.workflow.models import ApprovalRecord


class OutstandingRequestTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)

    def outstanding(self, who="emp"):
        c = APIClient()
        c.force_authenticate(self.users[who])
        return c.get(f"/api/recommendations/{self.rec.id}/").json()["workflow"]["outstanding_request"]

    def partial(self):
        submit_to_audit(self.users, self.rec)
        services.verify(
            self.rec, self.users["audit"], decision="partial", notes="n", rejected_items="Feb",
            rejection_reason="missing the signed sheet", required_action="attach the signed sheet",
            action_deadline=timezone.localdate() + datetime.timedelta(days=10),
        )
        self.rec.refresh_from_db()

    def resubmit(self):
        services.mark_implemented(self.rec, self.users["emp"])
        self.rec.refresh_from_db()

    def test_nothing_outstanding_before_any_send_back(self):
        self.assertIsNone(self.outstanding())

    def test_partial_verification_is_outstanding_for_employee_and_head(self):
        self.partial()
        for who in ("emp", "head"):
            req = self.outstanding(who)
            self.assertEqual(req["source"], "audit")
            self.assertEqual(req["rejection_reason"], "missing the signed sheet")
            self.assertEqual(req["required_action"], "attach the signed sheet")
            self.assertIsNotNone(req["action_deadline"])

    def test_head_return_is_stored_and_shown(self):
        services.mark_implemented(self.rec, self.users["emp"])
        self.rec.refresh_from_db()
        services.review_implementation(self.rec, self.users["head"], accept=False, notes="Attach the signed reconciliation sheet.")
        self.rec.refresh_from_db()
        req = self.outstanding("emp")
        self.assertEqual(req["source"], "head")
        self.assertEqual(req["notes"], "Attach the signed reconciliation sheet.")
        self.assertIsNone(req["action_deadline"])
        self.assertTrue(
            ApprovalRecord.objects.filter(
                recommendation=self.rec, approval_type="head_implementation_return",
                notes="Attach the signed reconciliation sheet.",
            ).exists()
        )

    def test_latest_send_back_wins_over_an_earlier_partial(self):
        self.partial()
        self.resubmit()
        services.review_implementation(self.rec, self.users["head"], accept=False, notes="Head wants Q4 too")
        self.rec.refresh_from_db()
        self.assertEqual(self.outstanding()["source"], "head")

    def test_sufficient_clears_an_earlier_partial(self):
        self.partial()
        self.resubmit()
        services.review_implementation(self.rec, self.users["head"], accept=True, notes="ok")
        self.rec.refresh_from_db()
        services.verify(self.rec, self.users["audit"], decision="sufficient", notes="ok")
        self.rec.refresh_from_db()
        self.assertIsNone(self.outstanding("audit"))

    def test_council_reopen_replaces_the_superseded_partial(self):
        self.partial()
        self.resubmit()
        services.review_implementation(self.rec, self.users["head"], accept=True, notes="ok")
        self.rec.refresh_from_db()
        services.verify(self.rec, self.users["audit"], decision="sufficient", notes="ok")
        self.rec.refresh_from_db()
        services.submit_for_closure(self.rec, self.users["audit"], notes="package")
        self.rec.refresh_from_db()
        services.council_closure(self.rec, self.users["council"], accept=False, notes="must cover Q4 too")
        self.rec.refresh_from_db()
        for who in ("emp", "head"):
            req = self.outstanding(who)
            self.assertEqual(req["source"], "council")
            self.assertEqual(req["notes"], "must cover Q4 too")
            self.assertIsNone(req["action_deadline"])
            self.assertNotIn("signed sheet", str(req))
