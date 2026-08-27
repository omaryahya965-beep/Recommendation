"""Development-only richer demo cases.

Requires `seed_demo` users. Safe to re-run: reports are keyed by a stable
`[DEMO]` title and already-driven recommendations are left as they are.
"""
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.notifications.services import run_reminders
from apps.organizations.models import Department, Municipality
from apps.workflow import services

S = Recommendation.Status
PREFIX = "[DEMO]"


def _users(municipality):
    return {
        "audit": User.objects.get(username="audit1", municipality=municipality),
        "head": User.objects.get(username="head_finance", municipality=municipality),
        "emp": User.objects.get(username="emp_finance1", municipality=municipality),
        "council": User.objects.get(username="council1", municipality=municipality),
    }


def _report(muni, dept, audit, title, engagement="assurance"):
    report, created = AuditReport.objects.get_or_create(
        municipality=muni,
        title=title,
        defaults={
            "department": dept,
            "engagement_type": engagement,
            "created_by": audit,
            "response_deadline": timezone.localdate() + timedelta(days=14),
        },
    )
    return report, created


def _rec(report, text, risk="high", priority=80):
    rec, created = Recommendation.objects.get_or_create(
        report=report,
        text=text,
        defaults={"risk_level": risk, "priority_score": priority, "root_cause": "ثغرة رقابية"},
    )
    return rec, created


def _plan(emp, days=30):
    return {
        "responsible_employee": emp,
        "target_date": timezone.localdate() + timedelta(days=days),
        "notes": "خطة تنفيذ تجريبية",
        "steps": [
            {"title": "إعداد الإجراء", "order": 0},
            {"title": "اعتماد الإجراء وتطبيقه", "order": 1, "depends_on_index": 0},
        ],
    }


def _drive_to_pending_council(rec, users):
    rec.refresh_from_db()
    if rec.status == S.DRAFT:
        return
    if rec.status == S.PENDING_RESPONSE:
        services.submit_response(rec, users["head"], decision="agree", justification="موافقة الإدارة")
        rec.refresh_from_db()
    if rec.status == S.AUDIT_REVIEW:
        services.review_response(rec, users["audit"], accept=True, notes="الرد مقبول")
        rec.refresh_from_db()


def _drive_full_close(rec, users):
    rec.refresh_from_db()
    if rec.status == S.CLOSED:
        return
    if rec.status == S.ACTION_PLAN_REQUIRED:
        services.submit_action_plan(rec, users["head"], _plan(users["emp"]))
        rec.refresh_from_db()
    if rec.status == S.ACTION_PLAN_REVIEW:
        services.review_action_plan(rec, users["audit"], approve=True, notes="معتمدة")
        rec.refresh_from_db()
    if rec.status == S.IN_PROGRESS:
        plan = rec.action_plan
        for step in plan.steps.order_by("order"):
            services.update_step_progress(rec, step, users["emp"], is_done=True)
        if not rec.evidence_files.exists():
            services.add_evidence(
                rec, users["emp"],
                file=SimpleUploadedFile("demo-proof.pdf", b"%PDF-1.4 demo evidence"),
                notes="إثبات التنفيذ",
            )
        rec.refresh_from_db()
        services.mark_implemented(rec, users["emp"])
        rec.refresh_from_db()
    if rec.status == S.PENDING_HEAD_REVIEW:
        services.review_implementation(rec, users["head"], accept=True, notes="التنفيذ مكتمل")
        rec.refresh_from_db()
    if rec.status == S.SUBMITTED_FOR_VERIFICATION:
        services.verify(rec, users["audit"], decision="sufficient", notes="أدلة كافية")
        rec.refresh_from_db()
    if rec.status == S.CLOSURE_REVIEW:
        services.submit_for_closure(rec, users["audit"], notes="ملف الإغلاق جاهز")
        rec.refresh_from_db()
    if rec.status == S.PENDING_CLOSURE_COUNCIL:
        services.council_closure(rec, users["council"], accept=True, notes="يوافق المجلس")
        rec.refresh_from_db()


class Command(BaseCommand):
    help = "Seed idempotent demo reports/recommendations in mixed workflow statuses."

    def handle(self, *args, **options):
        call_command("seed_demo")
        muni = Municipality.objects.get(name="بلدية النموذج")
        finance = Department.objects.get(municipality=muni, name="الدائرة المالية")
        users = _users(muni)
        summary = []

        # --- Report 1: stays draft -----------------------------------------
        r1, _ = _report(muni, finance, users["audit"], f"{PREFIX} مسودة تدقيق الرواتب")
        for text, risk, pr in (
            ("ضرورة توثيق دورة اعتماد مسيرات الرواتب قبل الصرف.", "high", 88),
            ("تفعيل مراجعة فصلية لصلاحيات نظام الرواتب.", "medium", 60),
            ("أرشفة قرارات التعيين والعلاوات في ملف إلكتروني موحد.", "low", 30),
        ):
            _rec(r1, text, risk, pr)
        summary.append((r1.title, list(r1.recommendations.values_list("status", flat=True))))

        # --- Report 2: sent to department, mixed response states ------------
        r2, r2_new = _report(muni, finance, users["audit"], f"{PREFIX} تدقيق المشتريات")
        recs2 = [
            _rec(r2, "إلزام أوامر الشراء بموافقة مالية مسبقة.", "high", 85)[0],
            _rec(r2, "توثيق تقييم الموردين سنوياً.", "medium", 55)[0],
            _rec(r2, "منع تجزئة المشتريات للالتفاف على سقف الصلاحية.", "high", 90)[0],
            _rec(r2, "حفظ عروض الأسعار في ملف المناقصة.", "low", 25)[0],
        ]
        if r2.status == AuditReport.Status.DRAFT:
            services.submit_report_to_department(r2, users["audit"])
        recs2[0].refresh_from_db()
        # leave recs2[0] at pending_response
        if recs2[1].status == S.PENDING_RESPONSE:
            services.submit_response(
                recs2[1], users["head"], decision="agree", justification="سيتم التقييم"
            )
        if recs2[2].status == S.PENDING_RESPONSE:
            services.submit_response(
                recs2[2], users["head"],
                decision="disagree",
                justification="السقف منصوص عليه في اللائحة المالية الحالية ولا توجد تجزئة مثبتة.",
            )
        _drive_to_pending_council(recs2[3], users)
        summary.append((r2.title, list(r2.recommendations.values_list("status", flat=True))))

        # --- Report 3: ratified; closed + overdue + plan required + plan review
        r3, _ = _report(muni, finance, users["audit"], f"{PREFIX} تدقيق الخزينة")
        closed, overdue, need_plan, plan_review = [
            _rec(r3, "فصل مهام أمين الصندوق عن تسجيل القيود.", "high", 95)[0],
            _rec(r3, "جرد مفاجئ للصندوق مرة كل ربع سنة.", "high", 82)[0],
            _rec(r3, "تحديث بوليصة التأمين على النقدية.", "medium", 50)[0],
            _rec(r3, "تركيب كاميرات على غرفة الصندوق.", "medium", 48)[0],
        ]
        if r3.status == AuditReport.Status.DRAFT:
            services.submit_report_to_department(r3, users["audit"])
        for rec in (closed, overdue, need_plan, plan_review):
            rec.refresh_from_db()
            if rec.status == S.PENDING_RESPONSE:
                services.submit_response(rec, users["head"], decision="agree", justification="موافقة")
            rec.refresh_from_db()
            if rec.status == S.AUDIT_REVIEW:
                services.review_response(rec, users["audit"], accept=True, notes="مقبول")
        r3.refresh_from_db()
        if r3.status == AuditReport.Status.UNDER_REVIEW:
            services.submit_report_to_council(r3, users["audit"])
        r3.refresh_from_db()
        if r3.status == AuditReport.Status.PENDING_COUNCIL:
            services.ratify_report(r3, users["council"], notes="مصادقة تجريبية")

        _drive_full_close(closed, users)

        overdue.refresh_from_db()
        if overdue.status == S.ACTION_PLAN_REQUIRED:
            services.submit_action_plan(overdue, users["head"], _plan(users["emp"], days=30))
            overdue.refresh_from_db()
        if overdue.status == S.ACTION_PLAN_REVIEW:
            services.review_action_plan(overdue, users["audit"], approve=True, notes="معتمدة")
            overdue.refresh_from_db()
        if overdue.status == S.IN_PROGRESS:
            plan = overdue.action_plan
            plan.target_date = timezone.localdate() - timedelta(days=14)
            plan.save(update_fields=["target_date"])

        # need_plan stays ACTION_PLAN_REQUIRED
        plan_review.refresh_from_db()
        if plan_review.status == S.ACTION_PLAN_REQUIRED:
            services.submit_action_plan(plan_review, users["head"], _plan(users["emp"], days=45))
        summary.append((r3.title, list(r3.recommendations.values_list("status", flat=True))))

        # --- Report 4: disagreement accepted (closed) -----------------------
        r4, _ = _report(muni, finance, users["audit"], f"{PREFIX} تدقيق العهد العينية")
        d1, d2, d3 = [
            _rec(r4, "تسجيل العهد في سجل مستقل عن المخزون.", "medium", 40)[0],
            _rec(r4, "جرد العهد عند نقل الموظف.", "low", 20)[0],
            _rec(r4, "تحديد سقف للعهد الشخصية.", "medium", 35)[0],
        ]
        if r4.status == AuditReport.Status.DRAFT:
            services.submit_report_to_department(r4, users["audit"])
        for rec in (d1, d2, d3):
            rec.refresh_from_db()
            if rec.status == S.PENDING_RESPONSE:
                services.submit_response(
                    rec, users["head"],
                    decision="disagree",
                    justification="العهد مسجلة في النظام المالي الحالي مع جرد سنوي معتمد.",
                )
            rec.refresh_from_db()
            if rec.status == S.AUDIT_REVIEW:
                services.review_response(rec, users["audit"], accept=True, notes="يُقبل الاعتراض")
        r4.refresh_from_db()
        if r4.status == AuditReport.Status.UNDER_REVIEW:
            services.submit_report_to_council(r4, users["audit"])
        r4.refresh_from_db()
        if r4.status == AuditReport.Status.PENDING_COUNCIL:
            services.ratify_report(r4, users["council"], notes="قبول الاعتراض")
        summary.append((r4.title, list(r4.recommendations.values_list("status", flat=True))))

        reminders = run_reminders()
        for title, statuses in summary:
            self.stdout.write(f"{title.encode('ascii', 'replace').decode()}: {list(statuses)}")
        self.stdout.write(self.style.SUCCESS(
            f"Demo data ready. Reminder pass created {reminders} notification(s)."
        ))
