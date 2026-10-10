"""The workflow contract: stages, guards, deadlines (W1), overdue ownership
(W2), the combined closure action (W4), error codes and the exported file."""
import datetime
import re
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audits.models import AuditReport, Recommendation
from apps.core.error_codes import ERROR_CODES, FIELD_ERROR_CODES
from apps.core.exceptions import WorkflowError
from apps.core.models import AuditTrail
from apps.core.testing import (
    drive_to_action_plan_required,
    drive_to_in_progress,
    finish_steps_and_evidence,
    make_world,
    submit_to_audit,
)
from apps.notifications.models import Notification
from apps.workflow import guards, presentation, services
from apps.workflow.models import ApprovalRecord, VerificationDecision

S = Recommendation.Status
TODAY = timezone.localdate


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def annotated(rec):
    return presentation.annotate_workflow(
        Recommendation.objects.select_related("report", "action_plan")
    ).get(pk=rec.pk)


class StageModelTests(TestCase):
    def test_every_status_has_a_stage_label_and_next_role(self):
        for status in S.values:
            self.assertIn(status, presentation.STATUS_STAGE)
            self.assertIn(status, presentation.STATUS_LABELS)
            self.assertIn(status, presentation.NEXT_ROLE)
            self.assertIn(presentation.STATUS_STAGE[status], presentation.STAGE_IDS)

    def test_ten_stages_in_lifecycle_order(self):
        self.assertEqual(len(presentation.STAGES), 10)
        self.assertEqual(presentation.STAGE_IDS[0], "preparation")
        self.assertEqual(presentation.STAGE_IDS[-1], "closed")
        order = [presentation.stage_index(status) for status in (
            S.DRAFT, S.PENDING_RESPONSE, S.AUDIT_REVIEW, S.PENDING_COUNCIL, S.ACTION_PLAN_REQUIRED,
            S.IN_PROGRESS, S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION,
            S.PENDING_CLOSURE_COUNCIL, S.CLOSED,
        )]
        self.assertEqual(order, list(range(1, 11)))

    def test_closed_label_follows_resolution(self):
        self.assertEqual(presentation.status_label(S.CLOSED, "implemented"), "مغلقة — نُفّذت")
        self.assertEqual(
            presentation.status_label(S.CLOSED, "disagreement_accepted"), "مغلقة — قُبل عدم الاتفاق"
        )


class GuardMatrixTests(TestCase):
    """Every action is offered exactly where the service would accept it."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def offered(self, user):
        return {item.id for item in guards.available_actions(self.rec, user)}

    def test_draft(self):
        self.assertEqual(self.offered(self.users["audit"]), {"edit_draft"})
        self.assertEqual(self.offered(self.users["head"]), set())

    def test_response_stage(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        self.assertEqual(self.offered(self.users["head"]), {"respond"})
        self.assertEqual(self.offered(self.users["other_head"]), set())
        self.assertEqual(self.offered(self.users["audit"]), set())

    def test_execution_actions_and_blockers(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        emp = self.users["emp"]
        offered = {item.id: item for item in guards.available_actions(self.rec, emp)}
        self.assertEqual(set(offered), {"update_progress", "upload_evidence", "delete_evidence", "mark_implemented"})
        mark = offered["mark_implemented"]
        self.assertFalse(mark.enabled)
        self.assertEqual({b.code for b in mark.blockers}, {"required_steps_incomplete", "evidence_required"})
        self.assertEqual(self.offered(self.users["emp2"]), set())
        self.assertEqual(self.offered(self.users["audit"]), set())

    def test_blockers_clear_when_steps_and_evidence_exist(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        mark = guards.check("mark_implemented", self.rec, self.users["emp"])
        self.assertTrue(mark.enabled)

    def test_service_refuses_what_the_guard_blocks(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        with self.assertRaises(WorkflowError) as ctx:
            services.mark_implemented(self.rec, self.users["emp"])
        self.assertEqual(ctx.exception.code, "required_steps_incomplete")
        self.assertEqual(ctx.exception.params["count"], 2)

    def test_wrong_status_reports_the_rule_code(self):
        with self.assertRaises(WorkflowError) as ctx:
            services.verify(self.rec, self.users["audit"], decision="sufficient")
        self.assertEqual(ctx.exception.code, "not_submitted_for_verification")

    def test_other_department_head_cannot_review_implementation(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        services.mark_implemented(self.rec, self.users["emp"])
        self.rec.refresh_from_db()
        with self.assertRaises(WorkflowError) as ctx:
            services.review_implementation(self.rec, self.users["other_head"], accept=True)
        self.assertEqual(ctx.exception.code, "not_own_department")

    def test_recurrence_confirmation_only_when_flagged(self):
        self.assertNotIn("confirm_recurrence", self.offered(self.users["audit"]))
        self.rec.is_recurring = True
        self.rec.save()
        self.assertIn("confirm_recurrence", self.offered(self.users["audit"]))


class DeadlineRulesTests(TestCase):
    """W1 (verification deadline binds returned work) and W2 (department
    overdue only while the department owns the action)."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        plan = self.rec.action_plan
        plan.target_date = TODAY() - datetime.timedelta(days=5)
        plan.save()
        self.rec.refresh_from_db()

    def submit(self):
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        self.rec.refresh_from_db()

    def test_plan_deadline_passed_while_department_owns_it_is_overdue(self):
        facts = presentation.facts(annotated(self.rec))
        self.assertTrue(facts["is_overdue"])
        self.assertEqual(facts["days_overdue"], 5)
        self.assertEqual(facts["deadline_source"], "plan")
        self.assertEqual(facts["waiting_on"], "department")

    def test_waiting_on_audit_is_not_department_overdue(self):
        self.submit()
        self.assertEqual(self.rec.status, S.SUBMITTED_FOR_VERIFICATION)
        facts = presentation.facts(annotated(self.rec))
        self.assertFalse(facts["is_overdue"])
        self.assertEqual(facts["waiting_on"], "audit")
        self.assertIsNone(facts["deadline"])
        self.assertEqual(facts["original_target_date"], self.rec.action_plan.target_date)

    def test_verification_deadline_becomes_binding(self):
        self.submit()
        new_deadline = TODAY() + datetime.timedelta(days=10)
        services.verify(
            self.rec, self.users["audit"], decision="partial",
            rejected_items="x", rejection_reason="y", required_action="z",
            action_deadline=new_deadline,
        )
        self.rec.refresh_from_db()
        facts = presentation.facts(annotated(self.rec))
        self.assertEqual(facts["deadline"], new_deadline)
        self.assertEqual(facts["deadline_source"], "verification")
        self.assertFalse(facts["is_overdue"])
        self.assertEqual(facts["due_in_days"], 10)
        # The original plan date stays visible.
        self.assertEqual(facts["original_target_date"], self.rec.action_plan.target_date)

    def test_returned_work_past_its_verification_deadline_is_overdue(self):
        self.submit()
        services.verify(
            self.rec, self.users["audit"], decision="insufficient",
            rejected_items="x", rejection_reason="y", required_action="z",
            action_deadline=TODAY() + datetime.timedelta(days=1),
        )
        VerificationDecision.objects.filter(recommendation=self.rec).update(
            action_deadline=TODAY() - datetime.timedelta(days=2)
        )
        self.rec.refresh_from_db()
        facts = presentation.facts(annotated(self.rec))
        self.assertTrue(facts["is_overdue"])
        self.assertEqual(facts["days_overdue"], 2)

    def test_deadline_for_returned_work_cannot_be_in_the_past(self):
        self.submit()
        with self.assertRaises(WorkflowError) as ctx:
            services.verify(
                self.rec, self.users["audit"], decision="partial",
                rejected_items="x", rejection_reason="y", required_action="z",
                action_deadline=TODAY() - datetime.timedelta(days=1),
            )
        self.assertEqual(ctx.exception.code, "deadline_in_past")

    def test_sql_and_python_agree(self):
        """The register filter and the row badge must never disagree."""
        overdue_ids = set(
            presentation.annotate_workflow(Recommendation.objects.all())
            .filter(presentation.overdue_q())
            .values_list("id", flat=True)
        )
        unannotated = Recommendation.objects.get(pk=self.rec.pk)
        self.assertEqual(self.rec.pk in overdue_ids, presentation.facts(unannotated)["is_overdue"])

    def test_queue_age_counts_from_entering_the_status(self):
        self.submit()
        AuditTrail.objects.filter(
            recommendation=self.rec, metadata__to_status=S.SUBMITTED_FOR_VERIFICATION
        ).update(created_at=timezone.now() - datetime.timedelta(days=6))
        facts = presentation.facts(annotated(self.rec))
        self.assertEqual(facts["days_waiting"], 6)

    def test_response_lateness_is_reported_separately(self):
        muni, dept, users, report, rec = make_world_two()
        report.response_deadline = TODAY() - datetime.timedelta(days=3)
        report.save()
        services.submit_report_to_department(report, users["audit"])
        rec.refresh_from_db()
        facts = presentation.facts(annotated(rec))
        self.assertTrue(facts["response_overdue"])
        self.assertFalse(facts["is_overdue"])
        self.assertEqual(facts["deadline_source"], "response")


def make_world_two():
    """A second, independent world (unique names) inside one test."""
    from apps.accounts.models import User
    from apps.organizations.models import Department, Municipality, WorkflowPolicy

    muni = Municipality.objects.create(name="Second City")
    WorkflowPolicy.objects.create(municipality=muni)
    dept = Department.objects.create(municipality=muni, name="Water")
    users = {
        "audit": User.objects.create_user("aud2", password="x", role=User.Role.AUDIT, municipality=muni),
        "head": User.objects.create_user(
            "head2", password="x", role=User.Role.DEPARTMENT_HEAD, municipality=muni, department=dept
        ),
    }
    report = AuditReport.objects.create(
        municipality=muni, department=dept, title="Water audit",
        engagement_type="assurance", created_by=users["audit"],
    )
    rec = Recommendation.objects.create(report=report, text="Meter reading", risk_level="low")
    return muni, dept, users, report, rec


class CombinedClosureTests(TestCase):
    """W4: "Sufficient + send to council" keeps both transitions."""

    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        finish_steps_and_evidence(self.users, self.rec)
        self.rec.refresh_from_db()
        submit_to_audit(self.users, self.rec)
        self.rec.refresh_from_db()

    def test_both_transitions_and_records_are_written(self):
        Notification.objects.all().delete()
        services.verify_and_submit_for_closure(self.rec, self.users["audit"], notes="كافية")
        self.rec.refresh_from_db()
        self.assertEqual(self.rec.status, S.PENDING_CLOSURE_COUNCIL)
        moves = list(
            AuditTrail.objects.filter(recommendation=self.rec, action__in=(
                "verified_sufficient", "closure_submitted_to_council"
            )).order_by("id").values_list("metadata__from_status", "metadata__to_status")
        )
        self.assertEqual(moves, [
            (S.SUBMITTED_FOR_VERIFICATION, S.CLOSURE_REVIEW),
            (S.CLOSURE_REVIEW, S.PENDING_CLOSURE_COUNCIL),
        ])
        self.assertTrue(
            VerificationDecision.objects.filter(recommendation=self.rec, decision="sufficient").exists()
        )
        self.assertTrue(
            ApprovalRecord.objects.filter(
                recommendation=self.rec, approval_type=ApprovalRecord.ApprovalType.CLOSURE_REVIEW
            ).exists()
        )
        # The council is asked to decide; the department hears once, not twice.
        self.assertTrue(Notification.objects.filter(user=self.users["council"]).exists())
        self.assertEqual(Notification.objects.filter(user=self.users["head"]).count(), 1)

    def test_api_combined_action(self):
        res = client_for(self.users["audit"]).post(
            f"/api/recommendations/{self.rec.id}/verify/",
            {"decision": "sufficient", "send_to_council": True, "notes": "ok"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], S.PENDING_CLOSURE_COUNCIL)

    def test_combined_requires_sufficient(self):
        res = client_for(self.users["audit"]).post(
            f"/api/recommendations/{self.rec.id}/verify/",
            {
                "decision": "partial", "send_to_council": True, "rejected_items": "x",
                "rejection_reason": "y", "required_action": "z",
                "action_deadline": str(TODAY() + datetime.timedelta(days=5)),
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "validation_error")
        self.assertIn("send_to_council", res.data["field_codes"])


class ApiContractTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_detail_carries_the_workflow_block(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        res = client_for(self.users["emp"]).get(f"/api/recommendations/{self.rec.id}/")
        workflow = res.data["workflow"]
        self.assertEqual(workflow["stage"], "execution")
        self.assertEqual(workflow["waiting_on"], "department")
        self.assertEqual(workflow["next_actor"]["role"], "employee")
        self.assertEqual(workflow["next_actor"]["user"]["id"], self.users["emp"].id)
        self.assertTrue(workflow["my_turn"])
        actions = {item["id"]: item for item in workflow["available_actions"]}
        self.assertFalse(actions["mark_implemented"]["enabled"])
        self.assertEqual(workflow["primary_action"], "update_progress")
        self.assertEqual(workflow["deadline"]["source"], "plan")

    def test_list_rows_carry_derived_fields(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        row = client_for(self.users["head"]).get("/api/recommendations/").data["results"][0]
        for key in (
            "title", "excerpt", "stage", "waiting_on", "next_role", "deadline", "deadline_source",
            "overdue", "days_overdue", "due_in_days", "days_waiting", "my_turn", "response_overdue",
        ):
            self.assertIn(key, row)
        self.assertFalse(row["my_turn"])  # waiting on the employee, not the head

    def test_list_rows_cost_no_query_per_row(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        drive_to_in_progress(self.users, self.report, self.rec)
        client = client_for(self.users["audit"])

        def count_queries():
            with CaptureQueriesContext(connection) as ctx:
                res = client.get("/api/recommendations/")
            self.assertEqual(res.status_code, 200)
            return len(ctx.captured_queries)

        few = count_queries()
        for index in range(8):
            Recommendation.objects.create(report=self.report, text=f"Extra {index}", risk_level="low")
        self.assertEqual(count_queries(), few)

    def test_filters_follow_the_same_rules(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        plan = self.rec.action_plan
        plan.target_date = TODAY() - datetime.timedelta(days=1)
        plan.save()
        client = client_for(self.users["audit"])
        overdue = client.get("/api/recommendations/?overdue=true").data["results"]
        self.assertEqual([row["id"] for row in overdue], [self.rec.id])
        self.assertTrue(overdue[0]["overdue"])
        execution = client.get("/api/recommendations/?stage=execution").data["results"]
        self.assertEqual([row["id"] for row in execution], [self.rec.id])
        self.assertEqual(client.get("/api/recommendations/?waiting_on=audit").data["count"], 0)
        emp_turn = client_for(self.users["emp"]).get("/api/recommendations/?my_turn=true").data
        self.assertEqual(emp_turn["count"], 1)

    def test_evidence_rows_say_whether_the_user_may_delete(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        services.add_evidence(
            self.rec, self.users["emp"], file=SimpleUploadedFile("p.pdf", b"%PDF-1.4"), notes="n"
        )
        mine = client_for(self.users["emp"]).get(f"/api/recommendations/{self.rec.id}/")
        self.assertTrue(mine.data["evidence_files"][0]["can_delete"])
        audit = client_for(self.users["audit"]).get(f"/api/recommendations/{self.rec.id}/")
        self.assertFalse(audit.data["evidence_files"][0]["can_delete"])


class ErrorPayloadTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()

    def test_workflow_errors_carry_code_and_params(self):
        drive_to_in_progress(self.users, self.report, self.rec)
        res = client_for(self.users["emp"]).post(f"/api/recommendations/{self.rec.id}/mark-implemented/")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "required_steps_incomplete")
        self.assertEqual(res.data["params"]["count"], 2)

    def test_validation_errors_carry_field_codes(self):
        services.submit_report_to_department(self.report, self.users["audit"])
        res = client_for(self.users["head"]).post(
            f"/api/recommendations/{self.rec.id}/respond/", {"decision": "disagree"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "validation_error")
        self.assertIn("justification", res.data)  # field keys stay where clients expect them
        self.assertEqual(res.data["field_codes"]["justification"], ["disagreement_requires_justification"])

    def test_generic_errors_carry_a_code(self):
        res = APIClient().get("/api/recommendations/")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data["code"], "not_authenticated")
        res = client_for(self.users["head"]).post(f"/api/recommendations/{self.rec.id}/verify/", {})
        self.assertEqual(res.data["code"], "permission_denied")


class ContractDriftTests(TestCase):
    BACKEND = Path(settings.BASE_DIR) / "apps"

    def source_codes(self):
        codes = set()
        pattern = re.compile(r'code="([a-z_]+)"')
        blocker = re.compile(r'Blocker\("([a-z_]+)"')
        for path in self.BACKEND.rglob("*.py"):
            if "tests" in path.parts or path.name.startswith("test"):
                continue
            text = path.read_text(encoding="utf-8")
            codes.update(pattern.findall(text))
            codes.update(blocker.findall(text))
        codes.update(rule.wrong_state for rule in guards.ACTIONS.values())
        return codes

    def test_every_raised_code_is_registered(self):
        known = set(ERROR_CODES) | set(FIELD_ERROR_CODES)
        missing = self.source_codes() - known
        self.assertEqual(missing, set(), f"Add these codes to apps/core/error_codes.py: {sorted(missing)}")

    def test_exported_contract_is_current(self):
        from apps.workflow.management.commands.export_workflow_contract import (
            committed_contract,
            render_contract,
        )

        self.assertEqual(
            committed_contract(),
            render_contract(),
            "Run: python manage.py export_workflow_contract",
        )
