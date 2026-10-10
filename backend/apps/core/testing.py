"""Shared fixtures for backend tests.

`make_world()` builds one municipality with two departments and a user per
role; the `drive_*` helpers move a recommendation through the real workflow
services so every fixture carries a genuine audit trail.
"""
import datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.organizations.models import Department, Municipality, WorkflowPolicy
from apps.workflow import services

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
