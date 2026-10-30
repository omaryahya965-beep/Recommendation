"""Add rows with hostile text to the local E2E database (layout tests).

Runs ONLY under config.settings.e2e, like e2e_reset. The rows imitate data
that already exists in production from before the text limits: a 300-character
unbroken title (255 for a report, the column maximum), a 100,000-character finding, long Arabic text and mixed
Arabic/Latin text. They are inserted directly (the API now refuses such text),
with mixed risk, status and deadlines so the register's sort order can be
tested. Idempotent: a second run returns the same rows.

    set DJANGO_SETTINGS_MODULE=config.settings.e2e
    python manage.py e2e_hostile_rows        # prints the ids as JSON
"""
from __future__ import annotations

import json
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from config.safety import assert_local_databases

MARKER = "E2E-HOSTILE"
LONG_REPORT_TITLE = "z" * 255  # the column maximum
UNBROKEN = "w" * 300
ARABIC_LONG = (
    "مراجعة شاملة لإجراءات التحصيل والإيداع اليومي في صناديق الدائرة المالية وفروعها "
    "مع توثيق كل حالة تأخير في الإيداع وأسبابها ومسؤولية كل موظف عنها وفق الأنظمة المعتمدة "
) * 3 + "التحقق" * 40
MIXED = (
    "تحديث نظام ERP-SAP_S4HANA_Finance_Module_v2.3.1 لدى الدائرة وربطه بالمسار "
    "https://example.org/finance/very/long/path/that/never/breaks/naturally/at/all"
)


def _text(title: str, body: str = "نص الملاحظة.") -> str:
    return f"العنوان:\n{title}\nالوضع القائم:\n{body}\n"


class Command(BaseCommand):
    help = "Insert hostile-text rows into the E2E database (E2E settings only)."

    def handle(self, *args, **options):
        if not getattr(settings, "E2E_MODE", False):
            raise CommandError("e2e_hostile_rows runs only with DJANGO_SETTINGS_MODULE=config.settings.e2e.")
        assert_local_databases(settings.DATABASES)

        from apps.accounts.models import User
        from apps.audits.models import AuditReport, Recommendation
        from apps.organizations.models import Department
        from apps.workflow.models import ActionPlan

        S = Recommendation.Status
        audit = User.objects.get(username="audit1")
        head = User.objects.get(username="head_finance")
        employee = User.objects.get(username="emp_finance1")
        finance = Department.objects.get(municipality=audit.municipality, name="الدائرة المالية")
        today = timezone.localdate()

        report = AuditReport.objects.filter(municipality=audit.municipality, title__startswith=LONG_REPORT_TITLE).first()
        if report is None:
            report = AuditReport.objects.create(
                municipality=audit.municipality,
                department=finance,
                title=LONG_REPORT_TITLE,
                engagement_type="assurance",
                created_by=audit,
                status=AuditReport.Status.RATIFIED,
                response_deadline=today + timedelta(days=30),
            )
            # title, body, risk, status, plan target (days from today)
            rows = [
                ("unbroken", _text(UNBROKEN), "low", S.IN_PROGRESS, 40),
                ("huge", _text(f"{MARKER} نص طويل جداً", "ب" * 100_000), "high", S.IN_PROGRESS, 20),
                ("arabic", _text(ARABIC_LONG), "medium", S.PARTIAL, 10),
                ("mixed", _text(MIXED), "high", S.IN_PROGRESS, -5),
                ("closed", _text(f"{MARKER} مغلقة"), "high", S.CLOSED, 60),
            ]
            for key, text, risk, status, days in rows:
                rec = Recommendation.objects.create(report=report, text=text, root_cause=key, risk_level=risk, status=status)
                ActionPlan.objects.create(
                    recommendation=rec,
                    responsible_employee=employee,
                    submitted_by=head,
                    target_date=today + timedelta(days=days),
                    status=ActionPlan.Status.APPROVED,
                )
        recs = {rec.root_cause: rec.id for rec in Recommendation.objects.filter(report=report)}
        self.stdout.write(json.dumps({"report": report.id, "recommendations": recs}))
