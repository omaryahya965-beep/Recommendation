"""Executive summaries grounded exclusively in retrieved system data."""
from __future__ import annotations

import json

from django.utils import timezone

from apps.ai.exceptions import AIError
from apps.ai.models import AIAnalysis
from apps.ai.providers import provider_meta
from apps.ai.services.case_copy import next_action, risk_label, status_label
from apps.ai.services.common import (
    content_hash,
    generate_structured,
    language_of,
    prefer_prose,
    store_analysis,
    text_matches_language,
)
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
    statement = sections.get("statement") or ("" if parsed["structured"] else rec.text)
    required_action = sections.get("required_action", "")
    title = case_title(rec.text)
    overdue = is_overdue(rec)
    heading = f"ملخص REC-{rec.id}" if ar else f"Summary — REC-{rec.id}"
    placeholder = is_repeated_placeholder(rec.text)

    if ar:
        parts = [
            f"{heading}: {clip(title, 80)}.",
            f"دائرة {rec.report.department.name} — الخطورة {risk_label(rec.risk_level, language)}، الحالة «{status_label(rec.status, language)}».",
        ]
        if placeholder:
            parts.append("نص الملاحظة مكرر ولا يكفي للمتابعة حتى يُعاد صياغته.")
        else:
            if condition:
                parts.append(f"ما وُجد: {clip(condition, 180)}")
            resolve = required_action or statement
            if resolve:
                parts.append(f"ما يُطلب: {clip(resolve, 160)}")
        parts.append(f"المطلوب الآن: {next_action(rec.status, language)}")
    else:
        parts = [
            f"{heading}: {clip(title, 80)}.",
            f"{rec.report.department.name} — risk {risk_label(rec.risk_level, language)}, status “{status_label(rec.status, language)}”.",
        ]
        if placeholder:
            parts.append("The finding text is repeated and should be rewritten before follow-up.")
        else:
            if condition:
                parts.append(f"Found: {clip(condition, 180)}")
            resolve = required_action or statement
            if resolve:
                parts.append(f"Required to resolve: {clip(resolve, 160)}")
        parts.append(f"Required now: {next_action(rec.status, language)}")

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
    return " ".join(parts).strip(), highlights, stats


def _template(stats: dict, language: str, title: str) -> str:
    ar = language != "en"
    top = stats.get("top_overdue_department") or ("—" if ar else "n/a")
    if ar:
        return (
            f"{title}\n\n"
            f"{stats['total']} توصية في النطاق: أُغلق {stats['closed']}، "
            f"قيد المتابعة {stats['open']}، متأخر {stats['overdue']}. "
            f"أعلى تأخير في دائرة {top}."
        )
    return (
        f"{title}\n\n"
        f"{stats['total']} recommendations in scope: {stats['closed']} closed, "
        f"{stats['open']} open, {stats['overdue']} overdue. "
        f"Highest overdue concentration: {top}."
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
    elif scope == "recommendation_list":
        status = payload.get("status")
        qs = recs
        if status:
            qs = qs.filter(status=status)
        dept_id = payload.get("department_id")
        if dept_id:
            qs = qs.filter(report__department_id=dept_id)
        stats = _stats_from_qs(qs)
        title = "ملخص قائمة التوصيات" if lang == "ar" else "Filtered recommendation list summary"
        target_type, target_id = "recommendation_list", 0
        municipality = user.municipality
    elif scope == "council_queue":
        qs = recs.filter(status__in=[S.PENDING_CLOSURE_COUNCIL, S.PENDING_COUNCIL, S.SUBMITTED_FOR_VERIFICATION])
        stats = _stats_from_qs(qs)
        title = "ملخص قائمة الموافقات للمجلس" if lang == "ar" else "Council approval queue summary"
        target_type, target_id = "council_queue", 0
        municipality = user.municipality
    elif scope == "employee_tasks":
        qs = recs.filter(action_plan__responsible_employee=user)
        stats = _stats_from_qs(qs)
        title = "ملخص مهام الموظف" if lang == "ar" else "Employee task list summary"
        target_type, target_id = "employee_tasks", user.id
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

    meta = provider_meta()

    fallback = {
        "title": title,
        "executive_summary": body,
        "body": body,
        "key_findings": [{"text": h, "source_ids": []} for h in highlights],
        "risk_overview": [],
        "status_overview": [],
        "important_deadlines": [],
        "recommended_next_steps": [],
        "open_questions": [],
        "limitations": [],
        "sources": [{"id": stats.get("reference") or "", "title": stats.get("title") or ""}],
        "language": lang,
        "provider": meta["provider"],
        "model": meta["model"]
    }

    llm_out = generate_structured(
        prompt,
        fallback=fallback,
    )

    for key in ["title", "executive_summary", "body", "key_findings", "risk_overview", "status_overview", "important_deadlines", "recommended_next_steps", "open_questions", "limitations", "sources"]:
        if key not in llm_out:
            llm_out[key] = fallback.get(key) or []

    summary_text = prefer_prose(
        llm_out.get("executive_summary") or llm_out.get("body"),
        body,
        lang,
        480,
    )
    reference = stats.get("reference")
    if reference and reference not in summary_text:
        summary_text = body
    llm_out["executive_summary"] = summary_text
    llm_out["body"] = summary_text
    if not text_matches_language(str(llm_out.get("title") or ""), lang):
        llm_out["title"] = title

    for key in ["key_findings", "recommended_next_steps"]:
        raw = llm_out.get(key)
        if isinstance(raw, list):
            filtered = []
            for item in raw:
                text = item.get("text") if isinstance(item, dict) else str(item)
                if not str(text).strip():
                    continue
                if lang == "ar" and not text_matches_language(str(text), lang):
                    continue
                filtered.append(item if isinstance(item, dict) else {"text": str(text)})
                if len(filtered) >= 4:
                    break
            llm_out[key] = filtered or fallback.get(key) or []
        else:
            llm_out[key] = fallback.get(key) or []

    for key in ["risk_overview", "status_overview", "important_deadlines"]:
        raw = llm_out.get(key)
        llm_out[key] = (raw[:4] if isinstance(raw, list) else fallback.get(key) or [])

    if not llm_out.get("recommended_next_steps"):
        llm_out["recommended_next_steps"] = [{"text": highlights[-1], "source_ids": []}] if highlights else []
    llm_out["open_questions"] = []
    llm_out["limitations"] = []

    # Filter out hallucinated source IDs
    allowed_ids = {f"REC-{item['id']}" for item in stats.get("items") or [] if item.get("id")}
    if scope == "recommendation" and stats.get("reference"):
        allowed_ids.add(stats["reference"])

    for key in ["key_findings", "risk_overview", "status_overview", "important_deadlines", "recommended_next_steps", "open_questions", "limitations"]:
        items_list = llm_out.get(key)
        if isinstance(items_list, list):
            for idx in range(len(items_list)):
                item = items_list[idx]
                if isinstance(item, dict) and "source_ids" in item:
                    item["source_ids"] = [sid for sid in item["source_ids"] if sid in allowed_ids]

    llm_out["language"] = lang
    llm_out["provider"] = meta["provider"]
    llm_out["model"] = meta["model"]
    llm_out["stats"] = trusted

    digest = content_hash(scope, trusted, lang, meta["model"], "summary_v4")
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.SUMMARY,
        target_type=target_type,
        target_id=target_id or 0,
        municipality=municipality,
        digest=digest,
        output=llm_out,
        confidence=90,
        user=user,
    )
