"""Executive summaries grounded exclusively in retrieved system data."""
from __future__ import annotations

import json

from django.utils import timezone

from apps.ai.exceptions import AIError
from apps.ai.models import AIAnalysis
from apps.ai.providers import provider_meta
from apps.ai.services.case_copy import next_action, risk_label, status_label
from apps.ai.services.common import content_hash, generate_structured, language_of, store_analysis
from apps.accounts.models import User
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text
from apps.audits.finding import case_title, clip, is_repeated_placeholder, parse_finding
from apps.audits.models import AuditReport, Recommendation
from apps.audits.serializers import is_overdue
from apps.core.permissions import scope_recommendations, scope_reports
from apps.followup.models import FollowUpReport

S = Recommendation.Status
OPEN = [s for s, _ in S.choices if s not in (S.CLOSED, S.DRAFT)]


def _scoped_recs(user):
    return scope_recommendations(
        Recommendation.objects.select_related(
            "report__department", "action_plan__responsible_employee"
        ).exclude(status=S.DRAFT),
        user,
    )


def _stats_from_qs(qs):
    total = qs.count()
    closed = qs.filter(status=S.CLOSED).count()
    open_count = qs.filter(status__in=OPEN).count()
    overdue = sum(1 for rec in qs.select_related("action_plan") if is_overdue(rec))
    by_dept = {}
    overdue_by_dept = {}
    recurring = 0
    themes = {}
    items = []
    for rec in qs.select_related("report__department", "action_plan")[:500]:
        dept = rec.report.department.name
        by_dept[dept] = by_dept.get(dept, 0) + 1
        if is_overdue(rec):
            overdue_by_dept[dept] = overdue_by_dept.get(dept, 0) + 1
        if rec.is_recurring:
            recurring += 1
        blob = f"{rec.text} {rec.root_cause}"
        for token in ("توثيق", "اعتماد", "شراء", "صلاح", "فصل", "documentation", "approval", "procurement"):
            if token.lower() in blob.lower():
                themes[token] = themes.get(token, 0) + 1
        items.append({
            "id": rec.id,
            "reference": f"REC-{rec.id}",
            "status": rec.status,
            "department": dept,
            "risk_level": rec.risk_level,
            "overdue": is_overdue(rec),
            "is_recurring": rec.is_recurring,
        })
    top_overdue_dept = max(overdue_by_dept, key=overdue_by_dept.get) if overdue_by_dept else None
    top_theme = max(themes, key=themes.get) if themes else None
    return {
        "total": total,
        "closed": closed,
        "open": open_count,
        "overdue": overdue,
        "recurring": recurring,
        "by_department": by_dept,
        "overdue_by_department": overdue_by_dept,
        "top_overdue_department": top_overdue_dept,
        "theme_hints": themes,
        "top_theme": top_theme,
        "items": items[:80],
    }


def _case_summary(rec, language: str) -> tuple[str, list[str], dict]:
    ar = language != "en"
    parsed = parse_finding(rec.text)
    sections = parsed["sections"]
    condition = sections.get("condition") or parsed["preamble"] or rec.text
    criteria = sections.get("criteria", "")
    effect = sections.get("effect", "")
    statement = sections.get("statement") or ("" if parsed["structured"] else rec.text)
    required_action = sections.get("required_action", "")
    success = sections.get("success") or sections.get("outcome", "")
    root = (rec.root_cause or "").strip()
    title = case_title(rec.text)
    plan = getattr(rec, "action_plan", None)
    overdue = is_overdue(rec)
    heading = f"ملخص تنفيذي — REC-{rec.id}" if ar else f"Executive Summary — REC-{rec.id}"
    placeholder = is_repeated_placeholder(rec.text)

    paragraphs = [heading, ""]
    if ar:
        paragraphs.append(
            f"الملف يخص دائرة {rec.report.department.name} ضمن تقرير «{rec.report.title}». "
            f"الخطورة المسجّلة {risk_label(rec.risk_level, language)}، والحالة الحالية "
            f"«{status_label(rec.status, language)}»."
        )
        if placeholder:
            paragraphs.append(
                "نص الملاحظة الحالي مكرر في أكثر من قسم ولا يكفي لوصف الخلل الرقابي أو حلّه. "
                "يلزم إعادة الصياغة قبل متابعة التنفيذ."
            )
        else:
            if condition:
                paragraphs.append(f"ما وُجد أثناء التدقيق: {clip(condition, 420)}")
            if criteria:
                paragraphs.append(f"المعيار الذي كان يجب تطبيقه: {clip(criteria, 280)}")
            if effect:
                paragraphs.append(f"الأثر المترتب: {clip(effect, 280)}")
            if statement:
                paragraphs.append(f"التوصية التصحيحية: {clip(statement, 360)}")
            if required_action and required_action != statement:
                paragraphs.append(f"الإجراء المطلوب من الإدارة: {clip(required_action, 280)}")
            if root:
                paragraphs.append(f"السبب الجذري الموثّق: {clip(root, 240)}")
            resolve = required_action or statement
            if resolve:
                paragraphs.append(f"ما الذي يحل المشكلة: {clip(resolve, 320)}")
            if success:
                paragraphs.append(f"مؤشر التحقق عند الإغلاق: {clip(success, 220)}")
        if plan and plan.target_date:
            progress = 0
            steps = list(plan.steps.all()) if hasattr(plan, "steps") else []
            if steps:
                progress = round(sum(s.progress_percent for s in steps) / len(steps))
            late = " (متأخرة عن الموعد)" if overdue else ""
            paragraphs.append(
                f"خطة العمل قائمة بموعد {plan.target_date}{late}، وتقدم الخطوات {progress}%."
            )
        else:
            paragraphs.append("لم تُعتمد خطة عمل بموعد مستهدف بعد.")
        paragraphs.append(f"المطلوب الآن: {next_action(rec.status, language)}")
    else:
        paragraphs.append(
            f"This file sits with {rec.report.department.name} under report “{rec.report.title}”. "
            f"Recorded risk is {risk_label(rec.risk_level, language)}; current status is "
            f"“{status_label(rec.status, language)}”."
        )
        if placeholder:
            paragraphs.append(
                "The finding text repeats the same short wording across sections and does not "
                "describe a control gap that can be followed up. It should be rewritten first."
            )
        else:
            if condition:
                paragraphs.append(f"What audit found: {clip(condition, 420)}")
            if criteria:
                paragraphs.append(f"Criteria / expected control: {clip(criteria, 280)}")
            if effect:
                paragraphs.append(f"Impact: {clip(effect, 280)}")
            if statement:
                paragraphs.append(f"Recommendation: {clip(statement, 360)}")
            if required_action and required_action != statement:
                paragraphs.append(f"Required management action: {clip(required_action, 280)}")
            if root:
                paragraphs.append(f"Documented root cause: {clip(root, 240)}")
            resolve = required_action or statement
            if resolve:
                paragraphs.append(f"What would resolve the issue: {clip(resolve, 320)}")
            if success:
                paragraphs.append(f"Success indicator at closure: {clip(success, 220)}")
        if plan and plan.target_date:
            progress = 0
            steps = list(plan.steps.all()) if hasattr(plan, "steps") else []
            if steps:
                progress = round(sum(s.progress_percent for s in steps) / len(steps))
            late = " (overdue)" if overdue else ""
            paragraphs.append(
                f"An action plan is in place with target date {plan.target_date}{late}; step progress is {progress}%."
            )
        else:
            paragraphs.append("No action plan with a target date has been approved yet.")
        paragraphs.append(f"Required now: {next_action(rec.status, language)}")

    highlights = [
        f"REC-{rec.id} — {title}",
        rec.report.department.name,
        status_label(rec.status, language),
        f"{('خطورة' if ar else 'Risk')}: {risk_label(rec.risk_level, language)}",
        next_action(rec.status, language),
    ]
    stats = {
        "total": 1,
        "closed": 1 if rec.status == S.CLOSED else 0,
        "open": 0 if rec.status == S.CLOSED else 1,
        "overdue": 1 if overdue else 0,
        "scope": "recommendation",
        "reference": f"REC-{rec.id}",
        "title": title,
        "department": rec.report.department.name,
        "status": rec.status,
        "risk_level": rec.risk_level,
        "facts": recommendation_public_facts(rec),
        "focus_text": scrub_text(rec.text, 800),
        "items": [{"id": rec.id, "reference": f"REC-{rec.id}", "status": rec.status, "department": rec.report.department.name}],
    }
    return "\n".join(paragraphs).strip(), highlights, stats


def _template(stats: dict, language: str, title: str) -> str:
    ar = language != "en"
    top = stats.get("top_overdue_department") or ("—" if ar else "n/a")
    theme = stats.get("top_theme") or ("التوثيق والاعتمادات" if ar else "documentation and approvals")
    if ar:
        return (
            f"{title}\n\n"
            f"خلال النطاق المحدد جرى متابعة {stats['total']} توصية. "
            f"أُغلق منها {stats['closed']}، وبقي {stats['open']} قيد المتابعة، "
            f"منها {stats['overdue']} متأخرة عن الموعد المستهدف.\n\n"
            f"أعلى تركيز للتوصيات المتأخرة في دائرة {top}. "
            f"إشارات التكرار/المواضيع المتشابهة ترتبط غالباً بـ {theme}. "
            f"عدد التوصيات المعلّمة كتكرار محتمل أو مؤكد: {stats['recurring']}."
        )
    return (
        f"{title}\n\n"
        f"During the selected scope, {stats['total']} recommendations were monitored. "
        f"{stats['closed']} were closed, {stats['open']} remain in progress, "
        f"and {stats['overdue']} are overdue.\n\n"
        f"The highest concentration of overdue recommendations is within {top}. "
        f"Recurring themes primarily concern {theme}. "
        f"{stats['recurring']} recommendations are flagged as possibly or confirmed recurring."
    )


def generate_summary(user, payload: dict, language: str = "ar") -> AIAnalysis:
    lang = language_of(language)
    scope = payload.get("scope") or "municipality"
    recs = _scoped_recs(user)

    if scope == "recommendation":
        rec_id = payload.get("recommendation_id")
        rec = scope_recommendations(
            Recommendation.objects.select_related(
                "report__department", "report", "action_plan", "response"
            ).prefetch_related("action_plan__steps"),
            user,
        ).filter(pk=rec_id).first()
        if rec is None:
            raise AIError("Recommendation not found.", http_status=404)
        body, highlights, stats = _case_summary(rec, lang)
        title = "ملخص تنفيذي" if lang == "ar" else "Executive Summary"
        target_type, target_id = "recommendation", rec.id
        municipality = rec.report.municipality
    elif scope == "department":
        dept_id = payload.get("department_id")
        if user.role == User.Role.DEPARTMENT_HEAD:
            dept_id = user.department_id
        if user.role == User.Role.EMPLOYEE:
            raise AIError("Employees cannot request department-wide summaries.", http_status=403)
        qs = recs.filter(report__department_id=dept_id) if dept_id else recs
        stats = _stats_from_qs(qs)
        title = "ملخص الدائرة" if lang == "ar" else "Department summary"
        target_type, target_id = "department", int(dept_id or 0)
        municipality = user.municipality
    elif scope == "report":
        report_id = payload.get("report_id")
        report = scope_reports(AuditReport.objects.all(), user).filter(pk=report_id).first()
        if report is None:
            raise AIError("Report not found.", http_status=404)
        stats = _stats_from_qs(recs.filter(report=report))
        title = "ملخص تقرير التدقيق" if lang == "ar" else "Audit report summary"
        target_type, target_id = "report", report.id
        municipality = report.municipality
    elif scope == "followup_period":
        start, end = payload.get("period_start"), payload.get("period_end")
        qs = recs
        if start:
            qs = qs.filter(created_at__date__gte=start)
        if end:
            qs = qs.filter(created_at__date__lte=end)
        fup_id = payload.get("followup_report_id")
        if fup_id:
            fup = FollowUpReport.objects.filter(pk=fup_id, municipality=user.municipality).first()
            if fup is None:
                raise AIError("Follow-up report not found.", http_status=404)
            # Prefer the stored snapshot totals so we do not invent a parallel dataset.
            snap = fup.snapshot or {}
            totals = snap.get("totals") or {}
            stats = {
                "total": totals.get("total", 0),
                "closed": totals.get("closed", 0),
                "open": (totals.get("total", 0) - totals.get("closed", 0)),
                "overdue": totals.get("overdue", 0),
                "recurring": sum(1 for i in snap.get("items") or [] if i.get("is_recurring")),
                "by_department": snap.get("by_department") or {},
                "overdue_by_department": {},
                "top_overdue_department": None,
                "theme_hints": {},
                "top_theme": None,
                "items": [
                    {"id": i.get("id"), "reference": f"REC-{i.get('id')}", "status": i.get("status"),
                     "department": i.get("department"), "overdue": i.get("overdue")}
                    for i in (snap.get("items") or [])[:80]
                ],
                "period_start": str(fup.period_start),
                "period_end": str(fup.period_end),
            }
            overdue_depts = {}
            for item in snap.get("items") or []:
                if item.get("overdue"):
                    overdue_depts[item.get("department")] = overdue_depts.get(item.get("department"), 0) + 1
            stats["overdue_by_department"] = overdue_depts
            stats["top_overdue_department"] = max(overdue_depts, key=overdue_depts.get) if overdue_depts else None
            target_id = fup.id
        else:
            stats = _stats_from_qs(qs)
            target_id = 0
        title = "ملخص فترة المتابعة" if lang == "ar" else "Follow-up period summary"
        target_type = "followup_period"
        municipality = user.municipality
    elif scope == "municipality":
        if user.role not in (User.Role.AUDIT, User.Role.COUNCIL):
            raise AIError("Municipality summaries are limited to audit and council.", http_status=403)
        stats = _stats_from_qs(recs)
        title = "ملخص البلدية" if lang == "ar" else "Municipality summary"
        target_type, target_id = "municipality", user.municipality_id
        municipality = user.municipality
    else:
        raise AIError("Unknown summary scope.")

    if scope != "recommendation":
        body = _template(stats, lang, title)
        highlights = [
            f"{stats['total']}",
            f"{stats['closed']}",
            f"{stats['overdue']}",
        ]
    prompt_name = "case_summary_v1.txt" if scope == "recommendation" else "summary_generation_v1.txt"
    trusted = {k: v for k, v in stats.items() if k != "items"}
    trusted["item_count"] = len(stats.get("items") or [])
    prompt = render_prompt(
        prompt_name,
        language="Modern Standard Arabic" if lang == "ar" else "English",
        trusted_json=json.dumps(trusted, ensure_ascii=False),
    )
    llm_out = generate_structured(
        prompt,
        fallback={"title": title, "body": body, "highlights": highlights, "confidence": 88},
    )
    llm_body = (llm_out.get("body") or "")[:1200] if isinstance(llm_out.get("body"), str) else ""
    if scope == "recommendation":
        # Keep the grounded case summary as the primary body; LLM may add a short elaboration.
        if llm_body.strip() and llm_body.strip() != body.strip():
            elaboration = llm_body
        else:
            elaboration = ""
        if isinstance(llm_out.get("highlights"), list) and llm_out["highlights"]:
            extra = [str(x)[:180] for x in llm_out["highlights"][:6] if str(x).strip()]
            highlights = list(dict.fromkeys([*highlights, *extra]))[:8]
    else:
        elaboration = llm_body
    output = {
        "title": title,
        "body": body,
        "llm_elaboration": elaboration,
        "highlights": highlights,
        "stats": trusted,
        "scope": scope,
        "confidence": 90,
        "advisory": True,
        "generated_at": timezone.now().isoformat(),
    }
    allowed = {item["id"] for item in stats.get("items") or [] if item.get("id")}
    for token in __import__("re").findall(r"REC-(\d+)", output["llm_elaboration"]):
        if int(token) not in allowed and scope != "recommendation":
            output["llm_elaboration"] = ""
            break

    meta = provider_meta()
    digest = content_hash(scope, trusted, lang, meta["model"], "summary_v2")
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.SUMMARY,
        target_type=target_type,
        target_id=target_id or 0,
        municipality=municipality,
        digest=digest,
        output=output,
        confidence=90,
        user=user,
    )
