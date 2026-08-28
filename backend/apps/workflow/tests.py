import datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import AuditTrail
from apps.organizations.models import Department, Municipality, WorkflowPolicy
from apps.workflow import services
from apps.workflow.models import ActionPlan, ApprovalRecord, Evidence, ManagementResponse, VerificationDecision

S = Recommendation.Status


def make_world():
    muni = Municipality.objects.create(name="Test City")
    WorkflowPolicy.objects.create(municipality=muni)
    dept = Department.objects.create(municipality=muni, name="Finance")
    other_dept = Department.objects.create(municipality=muni, name="Engineering")
    users = {
        "audit": User.objects.create_user(
            "aud", password="x", role=User.Role.AUDIT, municipality=muni
        ),
        "head": User.objects.create_user(
            "head", password="x", role=User.Role.DEPARTMENT_HEAD,
            municipality=muni, department=dept,
        ),
        "other_head": User.objects.create_user(
            "ohead", password="x", role=User.Role.DEPARTMENT_HEAD,
            municipality=muni, department=other_dept,
        ),
        "emp": User.objects.create_user(
            "emp", password="x", role=User.Role.EMPLOYEE,
            municipality=muni, department=dept,
        ),
        "emp2": User.objects.create_user(
            "emp2", password="x", role=User.Role.EMPLOYEE,
            municipality=muni, department=dept,
        ),
        "council": User.objects.create_user(
            "cou", password="x", role=User.Role.COUNCIL, municipality=muni
        ),
    }
    report = AuditReport.objects.create(
        municipality=muni, department=dept, title="Cash audit",
        engagement_type="assurance", created_by=users["audit"],
    )
    rec = Recommendation.objects.create(
        report=report, text="Segregate cash handling duties", risk_level="high",
    )
    return muni, dept, users, report, rec


def plan_data(users, days=30, steps=None):
    return {
        "responsible_employee": users["emp"],
        "target_date": timezone.localdate() + datetime.timedelta(days=days),
        "notes": "",
        "steps": steps if steps is not None else [
            {"title": "Draft procedure", "order": 0},
            {"title": "Approve procedure", "order": 1, "depends_on_index": 0},
        ],
    }


def drive_to_action_plan_required(users, report, rec):
    services.submit_report_to_department(report, users["audit"])
    rec.refresh_from_db()
    services.submit_response(rec, users["head"], decision="agree")
    services.review_response(rec, users["audit"], accept=True)
    services.submit_report_to_council(report, users["audit"])
    services.ratify_report(report, users["council"])
    rec.refresh_from_db()
    report.refresh_from_db()


def drive_to_in_progress(users, report, rec):
    drive_to_action_plan_required(users, report, rec)
    services.submit_action_plan(rec, users["head"], plan_data(users))
    rec.refresh_from_db()
    services.review_action_plan(rec, users["audit"], approve=True)
    rec.refresh_from_db()


def finish_steps_and_evidence(users, rec):
    plan = rec.action_plan
    for step in plan.steps.order_by("order"):
        services.update_step_progress(rec, step, users["emp"], is_done=True)
    services.add_evidence(
        rec, users["emp"],
        file=SimpleUploadedFile("proof.pdf", b"%PDF-1.4 test"),
        notes="signed procedure",
    )


def submit_to_audit(users, rec):
    """Employee marks complete, then the department head submits to internal audit."""
    services.mark_implemented(rec, users["emp"])
    rec.refresh_from_db()
    services.review_implementation(rec, users["head"], accept=True, notes="reviewed")
    rec.refresh_from_db()


def close_via_council(users, rec, notes="ok"):
    """Audit sufficient -> closure review -> council agrees -> CLOSED."""
    services.verify(rec, users["audit"], decision="sufficient", notes=notes)
    rec.refresh_from_db()
    services.submit_for_closure(rec, users["audit"], notes=notes)
    rec.refresh_from_db()
    services.council_closure(rec, users["council"], accept=True, notes=notes)
    rec.refresh_from_db()


class DefaultWorkflowTest(TestCase):
    """The corrected default flow: response -> audit review -> AUDIT_APPROVAL ->
    council ratification -> plan -> plan review -> execution -> verification."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_full_happy_path(self):
        users, report, rec = self.users, self.report, self.rec

        services.submit_report_to_department(report, users["audit"])
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.PENDING_RESPONSE)

        services.submit_response(rec, users["head"], decision="agree")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.AUDIT_REVIEW)
        # No action plan is required at response time by default.
        self.assertFalse(hasattr(rec, "action_plan"))

        services.review_response(rec, users["audit"], accept=True)
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.PENDING_COUNCIL)

        # AUDIT_APPROVAL exists; council ratification does not yet; anchor unset.
        self.assertEqual(
            rec.approvals.filter(
                approval_type=ApprovalRecord.ApprovalType.AUDIT_APPROVAL
            ).count(), 1,
        )
        self.assertEqual(
            rec.approvals.filter(
                approval_type=ApprovalRecord.ApprovalType.COUNCIL_RATIFICATION
            ).count(), 0,
        )
        report.refresh_from_db()
        self.assertIsNone(report.council_approval_date)

        services.submit_report_to_council(report, users["audit"])
        services.ratify_report(report, users["council"])
        rec.refresh_from_db()
        report.refresh_from_db()
        self.assertEqual(rec.status, S.ACTION_PLAN_REQUIRED)
        self.assertIsNotNone(report.council_approval_date)
        self.assertEqual(
            rec.approvals.filter(
                approval_type=ApprovalRecord.ApprovalType.COUNCIL_RATIFICATION
            ).count(), 1,
        )

        services.submit_action_plan(rec, users["head"], plan_data(users))
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.ACTION_PLAN_REVIEW)

        # Plan revision loop.
        services.review_action_plan(rec, users["audit"], approve=False, notes="dates unrealistic")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.REVISION_REQUIRED)
        services.submit_action_plan(rec, users["head"], plan_data(users, days=60))
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.ACTION_PLAN_REVIEW)
        services.review_action_plan(rec, users["audit"], approve=True)
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.IN_PROGRESS)
        self.assertEqual(rec.action_plan.revision_count, 1)

        finish_steps_and_evidence(self.users, rec)
        services.mark_implemented(rec, users["emp"])
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.PENDING_HEAD_REVIEW)

        services.review_implementation(rec, users["head"], accept=True, notes="implementation ok")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.SUBMITTED_FOR_VERIFICATION)

        # Insufficient loop with mandatory structured feedback.
        with self.assertRaises(WorkflowError):
            services.verify(rec, users["audit"], decision="insufficient")
        services.verify(
            rec, users["audit"], decision="insufficient",
            rejected_items="The uploaded procedure", rejection_reason="Not signed",
            required_action="Upload the signed version",
            action_deadline=timezone.localdate() + datetime.timedelta(days=7),
        )
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.RETURNED_INSUFFICIENT)
        verification = rec.verifications.first()
        self.assertEqual(verification.assigned_to, users["emp"])

        # New evidence auto-resumes execution, then resubmit via head review.
        services.add_evidence(
            rec, users["emp"], file=SimpleUploadedFile("signed.pdf", b"%PDF-1.4 s")
        )
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.IN_PROGRESS)
        submit_to_audit(users, rec)
        services.verify(rec, users["audit"], decision="sufficient", notes="ok")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.CLOSURE_REVIEW)
        self.assertEqual(rec.resolution, "")

        services.submit_for_closure(rec, users["audit"], notes="ready for council")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.PENDING_CLOSURE_COUNCIL)

        services.council_closure(rec, users["council"], accept=True, notes="closed")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.CLOSED)
        self.assertEqual(rec.resolution, Recommendation.Resolution.IMPLEMENTED)

        # Full immutable history exists.
        actions = list(
            AuditTrail.objects.filter(recommendation=rec).values_list("action", flat=True)
        )
        for expected in [
            "report_submitted_to_department", "management_response_submitted",
            "audit_approved_response", "council_ratification", "action_plan_submitted",
            "action_plan_revision_requested", "action_plan_approved", "execution_started",
            "step_progress_updated", "evidence_uploaded", "marked_implemented",
            "implementation_submitted_to_audit", "verified_insufficient", "verified_sufficient",
            "closure_submitted_to_council", "council_closed_recommendation",
        ]:
            self.assertIn(expected, actions, f"missing trail action {expected}")

    def test_disagree_requires_justification(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        with self.assertRaises(WorkflowError):
            services.submit_response(self.rec, self.users["head"], decision="disagree")

    def test_disagreement_accepted_closes_on_ratification(self):
        users, report, rec = self.users, self.report, self.rec
        services.submit_report_to_department(report, users["audit"])
        rec.refresh_from_db()
        services.submit_response(
            rec, users["head"], decision="disagree", justification="Control exists already"
        )
        services.review_response(rec, users["audit"], accept=True)
        services.submit_report_to_council(report, users["audit"])
        services.ratify_report(report, users["council"])
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.CLOSED)
        self.assertEqual(rec.resolution, Recommendation.Resolution.DISAGREEMENT_ACCEPTED)

    def test_response_revision_loop(self):
        users, rec = self.users, self.rec
        services.submit_report_to_department(self.report, users["audit"])
        rec.refresh_from_db()
        services.submit_response(rec, users["head"], decision="agree")
        with self.assertRaises(WorkflowError):
            services.review_response(rec, users["audit"], accept=False)  # notes required
        services.review_response(rec, users["audit"], accept=False, notes="incomplete")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.RETURNED_FOR_REVISION)
        services.submit_response(rec, users["head"], decision="agree", justification="revised")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.AUDIT_REVIEW)
        rec.response.refresh_from_db()
        self.assertEqual(rec.response.revision_count, 1)

    def test_closure_never_by_employee_alone(self):
        users, rec = self.users, self.rec
        drive_to_in_progress(users, self.report, rec)

        # Without completed steps and evidence, mark_implemented is refused.
        with self.assertRaises(WorkflowError):
            services.mark_implemented(rec, users["emp"])

        finish_steps_and_evidence(users, rec)
        services.mark_implemented(rec, users["emp"])
        rec.refresh_from_db()
        # Self-assessment only reaches the department head; it never closes
        # and never skips to internal audit.
        self.assertEqual(rec.status, S.PENDING_HEAD_REVIEW)
        with self.assertRaises(WorkflowError):
            services.verify(rec, users["emp"], decision="sufficient")
        with self.assertRaises(WorkflowError):
            services.council_closure(rec, users["emp"], accept=True)

    def test_step_dependency_enforced(self):
        users, rec = self.users, self.rec
        drive_to_in_progress(users, self.report, rec)
        steps = list(rec.action_plan.steps.order_by("order"))
        with self.assertRaises(WorkflowError):
            services.update_step_progress(rec, steps[1], users["emp"], is_done=True)
        services.update_step_progress(rec, steps[0], users["emp"], is_done=True)
        services.update_step_progress(rec, steps[1], users["emp"], is_done=True)

    def test_only_responsible_employee_may_execute(self):
        users, rec = self.users, self.rec
        drive_to_in_progress(users, self.report, rec)
        step = rec.action_plan.steps.first()
        with self.assertRaises(WorkflowError):
            services.update_step_progress(rec, step, users["emp2"], progress_percent=10)

    def test_plan_employee_must_belong_to_department(self):
        users, rec = self.users, self.rec
        drive_to_action_plan_required(users, self.report, rec)
        bad = plan_data(users)
        bad["responsible_employee"] = users["other_head"]
        with self.assertRaises(WorkflowError):
            services.submit_action_plan(rec, users["head"], bad)

    def test_illegal_transitions_rejected(self):
        users, rec = self.users, self.rec
        # Cannot verify a recommendation that was never submitted.
        with self.assertRaises(WorkflowError):
            services.verify(rec, users["audit"], decision="sufficient")
        # Department cannot respond before the report is sent.
        with self.assertRaises(WorkflowError):
            services.submit_response(rec, users["head"], decision="agree")
        # Council cannot ratify a draft report.
        with self.assertRaises(WorkflowError):
            services.ratify_report(self.report, users["council"])

    def test_other_department_head_cannot_respond(self):
        users, rec = self.users, self.rec
        services.submit_report_to_department(self.report, users["audit"])
        rec.refresh_from_db()
        with self.assertRaises(WorkflowError):
            services.submit_response(rec, users["other_head"], decision="agree")

    def test_head_review_required_before_audit(self):
        users, rec = self.users, self.rec
        drive_to_in_progress(users, self.report, rec)
        finish_steps_and_evidence(users, rec)
        services.mark_implemented(rec, users["emp"])
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.PENDING_HEAD_REVIEW)
        with self.assertRaises(WorkflowError):
            services.verify(rec, users["audit"], decision="sufficient")
        services.review_implementation(rec, users["head"], accept=False, notes="missing signature")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.IN_PROGRESS)
        submit_to_audit(users, rec)
        self.assertEqual(rec.status, S.SUBMITTED_FOR_VERIFICATION)

    def test_council_reopens_for_further_action(self):
        users, rec = self.users, self.rec
        drive_to_in_progress(users, self.report, rec)
        finish_steps_and_evidence(users, rec)
        submit_to_audit(users, rec)
        services.verify(rec, users["audit"], decision="sufficient", notes="ok")
        services.submit_for_closure(rec, users["audit"])
        rec.refresh_from_db()
        with self.assertRaises(WorkflowError):
            services.council_closure(rec, users["council"], accept=False)
        services.council_closure(rec, users["council"], accept=False, notes="need more coverage")
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.REOPENED)
        self.assertEqual(rec.resolution, "")


class PolicyPlanWithResponseTest(TestCase):
    """When municipal policy requires the plan with the response, it is
    reviewed as one unit and execution starts right after ratification."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        policy = self.muni.workflow_policy
        policy.require_plan_with_response = True
        policy.save()

    def test_plan_required_with_agreeing_response(self):
        users, rec = self.users, self.rec
        services.submit_report_to_department(self.report, users["audit"])
        rec.refresh_from_db()
        with self.assertRaises(WorkflowError):
            services.submit_response(rec, users["head"], decision="agree")

        services.submit_response(
            rec, users["head"], decision="agree", plan_data=plan_data(users)
        )
        services.review_response(rec, users["audit"], accept=True)
        services.submit_report_to_council(self.report, users["audit"])
        services.ratify_report(self.report, users["council"])
        rec.refresh_from_db()
        self.assertEqual(rec.status, S.IN_PROGRESS)
        self.assertEqual(rec.action_plan.status, ActionPlan.Status.APPROVED)


class AuditTrailImmutabilityTest(TestCase):
    def test_trail_cannot_be_updated_or_deleted(self):
        _, _, users, report, rec = make_world()
        services.submit_report_to_department(report, users["audit"])
        entry = AuditTrail.objects.filter(recommendation=rec).first()
        entry.action = "tampered"
        with self.assertRaises(ValueError):
            entry.save()
        with self.assertRaises(ValueError):
            entry.delete()


class ApiRbacTest(TestCase):
    """API-level scoping and the impossibility of arbitrary status changes."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()

    def _login(self, user):
        self.client.force_authenticate(user)

    def test_status_not_writable_from_api(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        self._login(self.users["audit"])
        response = self.client.patch(
            f"/api/recommendations/{self.rec.id}/", {"status": "closed"}, format="json"
        )
        # Non-draft recommendations cannot be edited at all.
        self.assertEqual(response.status_code, 409)
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.status, S.IN_PROGRESS)

    def test_department_head_sees_only_own_department(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self._login(self.users["other_head"])
        response = self.client.get("/api/recommendations/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self._login(self.users["head"])
        response = self.client.get("/api/recommendations/")
        self.assertEqual(response.data["count"], 1)

    def test_employee_sees_only_assigned(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        self._login(self.users["emp2"])
        self.assertEqual(self.client.get("/api/recommendations/").data["count"], 0)
        self._login(self.users["emp"])
        self.assertEqual(self.client.get("/api/recommendations/").data["count"], 1)

    def test_employee_cannot_create_report(self):
        self._login(self.users["emp"])
        response = self.client.post(
            "/api/reports/",
            {"department": self.dept.id, "title": "X", "engagement_type": "assurance"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_council_cannot_verify(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        services.mark_implemented(self.rec, self.users["emp"])
        self._login(self.users["council"])
        response = self.client.post(
            f"/api/recommendations/{self.rec.id}/verify/",
            {"decision": "sufficient"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_overdue_is_dynamic_not_a_state(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        plan = self.rec.action_plan
        plan.target_date = timezone.localdate() - datetime.timedelta(days=3)
        plan.save()
        self._login(self.users["audit"])
        response = self.client.get(f"/api/recommendations/{self.rec.id}/")
        self.assertTrue(response.data["overdue"])
        self.assertEqual(response.data["status"], S.IN_PROGRESS)  # not an "overdue" status


class EvidenceDeleteTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        self.rec.refresh_from_db()

    def _upload(self, user=None, name="proof.pdf"):
        return services.add_evidence(
            self.rec,
            user or self.users["emp"],
            file=SimpleUploadedFile(name, b"%PDF-1.4 delete-me"),
            notes="to be removed",
        )

    def test_employee_can_delete_own_file(self):
        ev = self._upload()
        services.delete_evidence(self.rec, self.users["emp"], ev)
        self.assertFalse(Evidence.objects.filter(pk=ev.id).exists())
        self.assertTrue(
            AuditTrail.objects.filter(
                recommendation=self.rec, action="evidence_deleted"
            ).exists()
        )

    def test_head_can_delete_employee_file(self):
        ev = self._upload()
        services.delete_evidence(self.rec, self.users["head"], ev)
        self.assertFalse(Evidence.objects.filter(pk=ev.id).exists())

    def test_other_employee_cannot_delete(self):
        ev = self._upload()
        with self.assertRaises(WorkflowError):
            services.delete_evidence(self.rec, self.users["emp2"], ev)

    def test_employee_cannot_delete_file_uploaded_by_head(self):
        ev = self._upload(user=self.users["head"], name="head-proof.pdf")
        with self.assertRaises(WorkflowError):
            services.delete_evidence(self.rec, self.users["emp"], ev)

    def test_audit_cannot_delete(self):
        ev = self._upload()
        with self.assertRaises(WorkflowError):
            services.delete_evidence(self.rec, self.users["audit"], ev)

    def test_cannot_delete_after_closure(self):
        ev = self._upload()
        self.rec.status = S.CLOSED
        self.rec.save(update_fields=["status"])
        with self.assertRaises(WorkflowError):
            services.delete_evidence(self.rec, self.users["emp"], ev)


class WorkflowNotificationTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_department_is_notified_when_report_is_sent(self):
        from apps.notifications.models import Notification

        services.submit_report_to_department(self.report, self.users["audit"])
        notes = Notification.objects.filter(user=self.users["head"])
        self.assertEqual(notes.count(), 1)
        note = notes.get()
        self.assertEqual(note.type, Notification.Type.RESPONSE_NEEDED)
        self.assertEqual(note.recommendation_id, self.rec.id)
        self.assertEqual(Notification.objects.filter(user=self.users["audit"]).count(), 0)
        self.assertEqual(Notification.objects.filter(user=self.users["council"]).count(), 0)
        self.assertEqual(Notification.objects.filter(user=self.users["emp"]).count(), 0)

    def test_happy_path_notifies_each_actor_through_closure(self):
        from apps.notifications.models import Notification

        users, report, rec = self.users, self.report, self.rec
        services.submit_report_to_department(report, users["audit"])
        rec.refresh_from_db()
        services.submit_response(rec, users["head"], decision="agree")
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["audit"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).exists()
        )
        services.review_response(rec, users["audit"], accept=True)
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["head"], type=Notification.Type.STATUS_CHANGE, recommendation=rec
            ).exists()
        )
        services.submit_report_to_council(report, users["audit"])
        self.assertTrue(
            Notification.objects.filter(
                user=users["council"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).exists()
        )
        services.ratify_report(report, users["council"])
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["head"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).filter(message__contains="خطة العمل").exists()
        )
        services.submit_action_plan(rec, users["head"], plan_data(users))
        rec.refresh_from_db()
        services.review_action_plan(rec, users["audit"], approve=True)
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["emp"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).exists()
        )
        finish_steps_and_evidence(users, rec)
        services.mark_implemented(rec, users["emp"])
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["head"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).filter(message__contains="رئيس الدائرة").exists()
        )
        services.review_implementation(rec, users["head"], accept=True, notes="ok")
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["audit"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).filter(message__contains="تحقق").exists()
        )
        services.verify(rec, users["audit"], decision="sufficient", notes="ok")
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["head"], type=Notification.Type.STATUS_CHANGE, recommendation=rec
            ).filter(message__contains="أدلة").exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                user=users["emp"], type=Notification.Type.STATUS_CHANGE, recommendation=rec
            ).filter(message__contains="أدلة").exists()
        )
        services.submit_for_closure(rec, users["audit"], notes="ready")
        rec.refresh_from_db()
        self.assertTrue(
            Notification.objects.filter(
                user=users["council"], type=Notification.Type.ACTION_REQUIRED, recommendation=rec
            ).filter(message__contains="إغلاق").exists()
        )
        services.council_closure(rec, users["council"], accept=True, notes="closed")
        rec.refresh_from_db()
        for actor in ("audit", "head", "emp"):
            self.assertTrue(
                Notification.objects.filter(
                    user=users[actor], type=Notification.Type.STATUS_CHANGE, recommendation=rec
                ).filter(message__contains="أغلق المجلس").exists(),
                msg=f"{actor} was not notified of closure",
            )
        self.assertFalse(Notification.objects.filter(recommendation__isnull=True).exists())

