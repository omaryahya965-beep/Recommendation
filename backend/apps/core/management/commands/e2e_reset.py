"""Create, migrate, wipe and seed the local E2E database.

Runs ONLY under config.settings.e2e (E2E_MODE) against a local database. It
destroys every row in that database, so the guards below are deliberate:
pointing it at the development database or Neon raises before anything runs.

    set DJANGO_SETTINGS_MODULE=config.settings.e2e
    python manage.py e2e_reset

Fixtures are created through the workflow services, never by setting
`status` directly, so every seeded case carries a real AuditTrail exactly as
production data would.
"""
from __future__ import annotations

import shutil
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from config.safety import assert_local_databases

PASSWORD = "E2e@12345"
MUNICIPALITY = "بلدية البيرة"
FINANCE = "الدائرة المالية"
ENGINEERING = "دائرة الهندسة"

USERS = [
    # username, role, department, full name
    ("audit1", "audit", None, "مدقق داخلي — اختبار"),
    ("head_finance", "department_head", FINANCE, "رئيس الدائرة المالية"),
    ("head_eng", "department_head", ENGINEERING, "رئيس دائرة الهندسة"),
    ("emp_finance1", "employee", FINANCE, "موظف مالية ١"),
    ("emp_finance2", "employee", FINANCE, "موظف مالية ٢"),
    ("emp_eng1", "employee", ENGINEERING, "موظف هندسة ١"),
    ("council1", "council", None, "المجلس البلدي — اختبار"),
]


def finding_text(title: str, condition: str, statement: str) -> str:
    """Recommendation text in the wizard's labelled format."""
    return (
        f"العنوان:\n{title}\n"
        f"الوضع القائم:\n{condition}\n"
        f"المعيار:\nالأنظمة المالية المعتمدة في البلدية.\n"
        f"الأثر:\nمخاطر مالية وتشغيلية.\n"
        f"التوصية:\n{statement}\n"
        f"الأدلة المتوقعة:\nنسخة معتمدة من الإجراء ومحضر التطبيق.\n"
    )


def _ensure_database_exists(config: dict) -> None:
    import psycopg

    name = config["NAME"]
    params = {
        "host": config.get("HOST") or "localhost",
        "port": config.get("PORT") or 5432,
        "user": config.get("USER") or "postgres",
        "dbname": "postgres",
        "autocommit": True,
    }
    if config.get("PASSWORD"):
        params["password"] = config["PASSWORD"]
    with psycopg.connect(**params) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (name,)
        ).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{name}"')


class Command(BaseCommand):
    help = "E2E only: create/migrate/flush/seed the local Playwright database."

    def handle(self, *args, **options):
        if not getattr(settings, "E2E_MODE", False):
            raise CommandError(
                "e2e_reset only runs with DJANGO_SETTINGS_MODULE=config.settings.e2e."
            )
        assert_local_databases(settings.DATABASES)

        _ensure_database_exists(settings.DATABASES["default"])
        call_command("migrate", interactive=False, verbosity=0)
        call_command("flush", interactive=False, verbosity=0)
        call_command("createcachetable", verbosity=0)

        media = Path(settings.MEDIA_ROOT)
        if media.exists():
            shutil.rmtree(media, ignore_errors=True)
        media.mkdir(parents=True, exist_ok=True)

        summary = seed()
        for key, value in summary.items():
            self.stdout.write(f"{key}={value}")
        self.stdout.write(self.style.SUCCESS("E2E database ready."))


def seed() -> dict:
    from apps.accounts.models import User
    from apps.audits.models import AuditReport, Recommendation
    from apps.notifications.services import ensure_default_rules
    from apps.organizations.models import Department, Municipality, WorkflowPolicy
    from apps.workflow import services

    municipality = Municipality.objects.create(name=MUNICIPALITY)
    WorkflowPolicy.objects.create(municipality=municipality)
    departments = {
        name: Department.objects.create(municipality=municipality, name=name)
        for name in (FINANCE, ENGINEERING)
    }
    users = {}
    for username, role, dept, full_name in USERS:
        user = User(
            username=username,
            role=role,
            municipality=municipality,
            department=departments.get(dept),
            full_name_ar=full_name,
            email=f"{username}@e2e.local",
        )
        user.set_password(PASSWORD)
        user.save()
        users[username] = user
    ensure_default_rules(municipality)

    audit = users["audit1"]
    today = timezone.localdate()

    def report(title, dept, status_note=""):
        return AuditReport.objects.create(
            municipality=municipality,
            department=departments[dept],
            title=title,
            engagement_type=AuditReport.EngagementType.ASSURANCE,
            created_by=audit,
            response_deadline=today + timedelta(days=14),
        )

    def rec(rpt, title, risk="high", priority=70):
        return Recommendation.objects.create(
            report=rpt,
            text=finding_text(
                title,
                f"لوحظ أن {title} دون ضوابط موثقة.",
                f"اعتماد إجراء مكتوب يعالج {title}.",
            ),
            root_cause="غياب إجراء مكتوب",
            risk_level=risk,
            priority_score=priority,
        )

    def to_in_progress(rpt, recommendation, employee, head, days=30):
        services.submit_report_to_department(rpt, audit)
        recommendation.refresh_from_db()
        services.submit_response(recommendation, head, decision="agree", justification="نوافق")
        recommendation.refresh_from_db()
        services.review_response(recommendation, audit, accept=True, notes="مقبول")
        rpt.refresh_from_db()
        services.submit_report_to_council(rpt, audit)
        rpt.refresh_from_db()
        services.ratify_report(rpt, users["council1"], notes="مصادقة")
        recommendation.refresh_from_db()
        services.submit_action_plan(
            recommendation,
            head,
            {
                "responsible_employee": employee,
                "target_date": today + timedelta(days=days),
                "notes": "خطة اختبار",
                "steps": [
                    {"title": "إعداد مسودة الإجراء", "order": 0},
                    {"title": "اعتماد الإجراء وتعميمه", "order": 1, "depends_on_index": 0},
                ],
            },
        )
        recommendation.refresh_from_db()
        services.review_action_plan(recommendation, audit, approve=True, notes="معتمدة")
        recommendation.refresh_from_db()
        return recommendation

    # Scoping: an Engineering case Finance must never see.
    eng_report = report("[E2E] تقرير الهندسة — بانتظار الرد", ENGINEERING)
    eng_rec = rec(eng_report, "صيانة المعدات الهندسية")
    services.submit_report_to_department(eng_report, audit)

    # Execution: a Finance case assigned to emp_finance1.
    exec_report = report("[E2E] تقرير المالية — قيد التنفيذ", FINANCE)
    exec_rec = rec(exec_report, "ضبط السلف النقدية")
    to_in_progress(exec_report, exec_rec, users["emp_finance1"], users["head_finance"])

    # Overdue: plan deadline already passed, still with the employee.
    late_report = report("[E2E] تقرير المالية — متأخرة", FINANCE)
    late_rec = rec(late_report, "تسوية حسابات الموردين", risk="medium", priority=55)
    to_in_progress(late_report, late_rec, users["emp_finance2"], users["head_finance"], days=-10)

    # Council closure: a Finance case waiting for the council's decision.
    closure_report = report("[E2E] تقرير المالية — بانتظار الإغلاق", FINANCE)
    closure_rec = rec(closure_report, "توثيق محاضر لجنة المشتريات", risk="low", priority=40)
    to_in_progress(closure_report, closure_rec, users["emp_finance1"], users["head_finance"])
    for step in closure_rec.action_plan.steps.order_by("order"):
        services.update_step_progress(closure_rec, step, users["emp_finance1"], is_done=True)
    services.add_evidence(
        closure_rec,
        users["emp_finance1"],
        file=SimpleUploadedFile("closure-proof.pdf", b"%PDF-1.4 e2e closure evidence"),
        notes="محضر معتمد",
    )
    services.mark_implemented(closure_rec, users["emp_finance1"])
    closure_rec.refresh_from_db()
    services.review_implementation(closure_rec, users["head_finance"], accept=True, notes="مكتمل")
    closure_rec.refresh_from_db()
    services.verify(closure_rec, audit, decision="sufficient", notes="كافية")
    closure_rec.refresh_from_db()
    services.submit_for_closure(closure_rec, audit, notes="جاهز للإغلاق")

    # Audit drafting: an unissued Finance report with one draft recommendation.
    draft_report = report("[E2E] تقرير المالية — مسودة", FINANCE)
    draft_rec = rec(draft_report, "مراجعة صلاحيات النظام المحاسبي", risk="medium", priority=0)

    return {
        "eng_rec": eng_rec.id,
        "exec_rec": exec_rec.id,
        "late_rec": late_rec.id,
        "closure_rec": closure_rec.id,
        "draft_report": draft_report.id,
        "draft_rec": draft_rec.id,
        "status_exec": Recommendation.objects.get(pk=exec_rec.id).status,
    }
