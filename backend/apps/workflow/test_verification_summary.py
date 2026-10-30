"""Round 2, 2.3: the verification summary follows the latest decision through
Partial -> corrected evidence -> Sufficient -> Council -> reopen -> resubmit."""
import datetime

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.testing import drive_to_in_progress, finish_steps_and_evidence, make_world, submit_to_audit
from apps.workflow import services
from apps.workflow.models import VerificationDecision
from apps.workflow.presentation import outstanding_request


class VerificationSummaryFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)

    def detail(self, who="emp"):
        api = APIClient()
        api.force_authenticate(self.users[who])
        res = api.get(f"/api/recommendations/{self.rec.id}/")
        self.assertEqual(res.status_code, 200)
        return res.json()

    def latest(self, data):
        # The API lists decisions newest first; the summary must agree with
        # the newest by time (then id), never with list position.
        decisions = sorted(data["verifications"], key=lambda d: (d["created_at"], d["id"]), reverse=True)
        self.assertEqual([d["id"] for d in data["verifications"]], [d["id"] for d in decisions])
        return decisions[0]["decision"] if decisions else None

    def step(self, fn):
        fn()
        self.rec.refresh_from_db()

    def test_full_round_trip(self):
        users = self.users
        self.step(lambda: submit_to_audit(users, self.rec))
        self.step(lambda: services.verify(
            self.rec, users["audit"], decision="partial", notes="n", rejected_items="Feb",
            rejection_reason="missing the signed sheet", required_action="attach the signed sheet",
            action_deadline=timezone.localdate() + datetime.timedelta(days=10),
        ))
        data = self.detail()
        self.assertEqual(self.latest(data), "partial")
        self.assertEqual(data["workflow"]["outstanding_request"]["source"], "audit")

        # Corrected evidence, resubmitted, accepted by the head, verified Sufficient.
        self.step(lambda: services.add_evidence(
            self.rec, users["emp"], file=SimpleUploadedFile("signed.pdf", b"%PDF-1.4 signed"), notes="signed sheet",
        ))
        self.step(lambda: services.mark_implemented(self.rec, users["emp"]))
        self.step(lambda: services.review_implementation(self.rec, users["head"], accept=True, notes="ok"))
        self.step(lambda: services.verify(self.rec, users["audit"], decision="sufficient", notes="complete"))
        data = self.detail("audit")
        self.assertEqual(self.latest(data), "sufficient")
        self.assertIsNone(data["workflow"]["outstanding_request"])

        # Sent to the Council, which reopens it.
        self.step(lambda: services.submit_for_closure(self.rec, users["audit"], notes="package"))
        self.step(lambda: services.council_closure(self.rec, users["council"], accept=False, notes="cover Q4 too"))
        data = self.detail()
        self.assertEqual(data["status"], "reopened")
        self.assertEqual(data["workflow"]["outstanding_request"]["source"], "council")
        self.assertEqual(data["workflow"]["outstanding_request"]["notes"], "cover Q4 too")
        self.assertEqual(self.latest(data), "sufficient", "the Council's reopen is not a verification")

        # Resubmitted and verified again: the newest decision wins once more.
        self.step(lambda: services.mark_implemented(self.rec, users["emp"]))
        self.step(lambda: services.review_implementation(self.rec, users["head"], accept=True, notes="ok"))
        self.step(lambda: services.verify(
            self.rec, users["audit"], decision="partial", notes="n", rejected_items="Q4",
            rejection_reason="Q4 missing", required_action="add Q4",
            action_deadline=timezone.localdate() + datetime.timedelta(days=5),
        ))
        data = self.detail()
        self.assertEqual(self.latest(data), "partial")
        self.assertEqual(data["workflow"]["outstanding_request"]["source"], "audit")
        self.assertIn("Q4 missing", str(data["workflow"]["outstanding_request"]))

    def test_same_timestamp_is_broken_by_id(self):
        self.step(lambda: submit_to_audit(self.users, self.rec))
        moment = timezone.now()
        first = VerificationDecision.objects.create(
            recommendation=self.rec, decision="sufficient", reviewed_by=self.users["audit"],
        )
        second = VerificationDecision.objects.create(
            recommendation=self.rec, decision="partial", reviewed_by=self.users["audit"], required_action="redo",
            action_deadline=timezone.localdate() + datetime.timedelta(days=3),
        )
        VerificationDecision.objects.filter(pk__in=[first.pk, second.pk]).update(created_at=moment)
        self.rec.status = "partial"
        self.rec.save(update_fields=["status"])
        request = outstanding_request(self.rec)
        self.assertIsNotNone(request)
        self.assertEqual(request["decision"], "partial", "the higher id is the later decision")
