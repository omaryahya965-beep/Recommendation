"""Internal audit assistant with server-side tools only. No raw SQL. RBAC on every tool."""
from __future__ import annotations

import json
import re

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.ai.models import AIConversation, AIMessage
from apps.ai.providers import provider_meta
from apps.ai.services.common import generate_structured, language_of
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.risk_engine import delay_risk_score_only
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text
from apps.audits.models import Recommendation
from apps.audits.serializers import is_overdue
from apps.core.permissions import scope_recommendations
from apps.followup.models import FollowUpReport
from apps.workflow.models import VerificationDecision

S = Recommendation.Status
OPEN = [s for s, _ in S.choices if s not in (S.CLOSED, S.DRAFT)]
ACTIVE = (
    S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED,
    S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION,
    S.CLOSURE_REVIEW, S.PENDING_CLOSURE_COUNCIL,
)

INJECTION = re.compile(
    r"(ignore (all )?(previous|prior) instructions|you are now|system prompt|"
    r"تجاهل.*(تعليمات|التعليمات)|نفّذ SQL|execute sql)",
    re.I,
)
REC_ID = re.compile(r"(?:REC-?|توصية\s*)(\d+)", re.I)
NAMED = re.compile(
    r"(?:اسمها|اسمه|عنوانها|عنوانه|عنوان(?:ها)?|تسمى|يُسم[ىي]|named|called|titled)\s+[:\-]?\s*(.+)$",
    re.I,
)
BARE_NAMED = re.compile(
    r"هل\s+(?:في|فيه|توجد|يوجد)\s+توصي[ةه]\s+(?:اسمها\s+|اسمه\s+|عنوانها\s+)?[\"'«»]?([A-Za-z0-9_\u0600-\u06FF]{2,})",
    re.I,
)
NAME_HINT = re.compile(r"(اسمها|اسمه|عنوانها|عنوانه|تسمى|named|called|titled)", re.I)


def _qs(user):
    qs = scope_recommendations(
        Recommendation.objects.select_related(
            "report__department", "report", "action_plan__responsible_employee"
        ),
        user,
    )
    # Audit drafts are real cases in the register; other roles only see issued work.
    if user.role != "audit":
        qs = qs.exclude(status=S.DRAFT)
    return qs


def _display_title(text: str) -> str:
    blob = text or ""
    match = re.search(r"(?:^|\n)\s*العنوان:\s*(?:\n\s*)?(.+)", blob)
    if match:
        return match.group(1).strip()[:120]
    for line in blob.splitlines():
        stripped = line.strip()
        if stripped and not stripped.endswith(":"):
            return stripped[:120]
    return blob[:120]


def _name_query(message: str) -> str:
    """Only when the user is clearly asking for a recommendation by name/title."""
    text = (message or "").strip()
    if not text:
        return ""
    quoted = re.findall(r"[\"'«»]([^\"'«»]{1,80})[\"'«»]", text)
    if quoted and NAME_HINT.search(text):
        return quoted[0].strip()[:80]
    named = NAMED.search(text)
    if named:
        raw = re.split(r"[؟?!.]", named.group(1), 1)[0]
        raw = re.sub(r"^(ال)?توصي[ةه]\s+", "", raw.strip())
        token = raw.strip(" \"'«»").strip()
        if token:
            return token[:80]
    bare = BARE_NAMED.search(text)
    if bare:
        return bare.group(1).strip()[:80]
    return ""


def _brief(rec) -> dict:
    plan = getattr(rec, "action_plan", None)
    title = _display_title(rec.text)
    return {
        "id": rec.id,
        "reference": f"REC-{rec.id}",
        "title": title,
        "text": (rec.text or "")[:240],
        "status": rec.status,
        "risk_level": rec.risk_level,
        "department": rec.report.department.name,
        "overdue": is_overdue(rec),
        "is_recurring": rec.is_recurring,
        "recurrence_confirmed": rec.recurrence_confirmed,
        "target_date": str(plan.target_date) if plan else None,
    }


def tool_get_recommendation(user, rec_id: int):
    rec = _qs(user).filter(pk=rec_id).first()
    if rec is None:
        return {"error": "not_found_or_unauthorized"}
    facts = recommendation_public_facts(rec)
    facts["title"] = _display_title(rec.text)
    facts["text"] = scrub_text(rec.text, 800)
    facts["root_cause"] = scrub_text(rec.root_cause, 400)
    facts["overdue"] = is_overdue(rec)
    return facts


def tool_search_recommendations(user, query: str = "", department: str = "", status: str = ""):
    qs = _qs(user)
    term = (query or "").strip()[:80]
    if term:
        qs = qs.filter(
            Q(text__icontains=term)
            | Q(root_cause__icontains=term)
            | Q(report__title__icontains=term)
            | Q(report__department__name__icontains=term)
            | Q(action_plan__responsible_employee__username__icontains=term)
            | Q(action_plan__responsible_employee__full_name_ar__icontains=term)
        ).distinct()
    if department:
        qs = qs.filter(report__department__name__icontains=department[:80])
    if status:
        qs = qs.filter(status=status)
    matches = [_brief(rec) for rec in qs[:15]]
    return {"query": term, "count": len(matches), "matches": matches}


def tool_get_department_statistics(user, department: str = ""):
    qs = _qs(user)
    if department:
        qs = qs.filter(report__department__name__icontains=department[:80])
    elif user.role == "department_head" and user.department_id:
        qs = qs.filter(report__department_id=user.department_id)
    total = qs.count()
    closed = qs.filter(status=S.CLOSED).count()
    overdue = qs.filter(status__in=ACTIVE, action_plan__target_date__lt=timezone.localdate()).count()
    recurring = qs.filter(is_recurring=True).count()
    return {
        "department": department or (user.department.name if user.department_id else "scoped"),
        "total": total,
        "closed": closed,
        "open": total - closed,
        "overdue": overdue,
        "recurring": recurring,
    }


def tool_get_overdue_recommendations(user):
    today = timezone.localdate()
    qs = _qs(user).filter(status__in=ACTIVE, action_plan__target_date__lt=today)
    return [_brief(r) for r in qs.order_by("action_plan__target_date")[:20]]


def tool_get_recurring_findings(user):
    qs = _qs(user).filter(is_recurring=True)
    return [_brief(r) for r in qs[:20]]


def tool_get_action_plan_status(user, rec_id: int):
    rec = _qs(user).filter(pk=rec_id).first()
    if rec is None:
        return {"error": "not_found_or_unauthorized"}
    plan = getattr(rec, "action_plan", None)
    if plan is None:
        return {"reference": f"REC-{rec.id}", "has_plan": False}
    steps = list(plan.steps.all())
    return {
        "reference": f"REC-{rec.id}",
        "has_plan": True,
        "plan_status": plan.status,
        "target_date": str(plan.target_date),
        "revision_count": plan.revision_count,
        "steps_total": len(steps),
        "steps_done": sum(1 for s in steps if s.is_done),
        "step_titles": [s.title for s in steps[:12]],
    }


def tool_get_evidence_status(user, rec_id: int):
    rec = _qs(user).filter(pk=rec_id).first()
    if rec is None:
        return {"error": "not_found_or_unauthorized"}
    files = rec.evidence_files.all()
    latest_v = rec.verifications.order_by("-created_at").first()
    return {
        "reference": f"REC-{rec.id}",
        "evidence_count": files.count(),
        "latest_verification": latest_v.decision if latest_v else None,
        "insufficient_count": rec.verifications.filter(
            decision=VerificationDecision.Decision.INSUFFICIENT
        ).count(),
    }


def tool_get_audit_history(user, rec_id: int):
    rec = _qs(user).filter(pk=rec_id).first()
    if rec is None:
        return {"error": "not_found_or_unauthorized"}
    entries = rec.trail_entries.select_related("user").order_by("-created_at")[:15]
    return {
        "reference": f"REC-{rec.id}",
        "actions": [
            {"action": e.action, "at": e.created_at.isoformat(), "role": e.user.role}
            for e in entries
        ],
    }


def tool_get_followup_reports(user):
    if user.role == "employee":
        return {"error": "not_authorized"}
    qs = FollowUpReport.objects.filter(municipality=user.municipality).order_by("-created_at")[:5]
    return [
        {
            "id": r.id,
            "period_start": str(r.period_start),
            "period_end": str(r.period_end),
            "totals": (r.snapshot or {}).get("totals"),
        }
        for r in qs
    ]


def tool_get_approaching_deadlines(user):
    from datetime import timedelta

    today = timezone.localdate()
    until = today + timedelta(days=14)
    qs = _qs(user).filter(
        status__in=ACTIVE,
        action_plan__target_date__gte=today,
        action_plan__target_date__lte=until,
    )
    return [_brief(r) for r in qs.order_by("action_plan__target_date")[:20]]


def tool_get_insufficient_verification(user):
    qs = _qs(user).filter(
        verifications__decision=VerificationDecision.Decision.INSUFFICIENT
    ).distinct()
    return [_brief(r) for r in qs[:20]]


def _bucket(qs, limit=12) -> dict:
    return {"count": qs.count(), "items": [_brief(rec) for rec in qs[:limit]]}


def tool_get_portfolio(user):
    """Live scoped snapshot so every turn can answer counts without guessing."""
    qs = _qs(user)
    today = timezone.localdate()
    until = today + timedelta(days=14)
    overdue_qs = qs.filter(status__in=ACTIVE, action_plan__target_date__lt=today)
    approaching_qs = qs.filter(
        status__in=ACTIVE,
        action_plan__target_date__gte=today,
        action_plan__target_date__lte=until,
    )
    status_rows = qs.values("status").annotate(c=Count("id"))
    risk_rows = qs.values("risk_level").annotate(c=Count("id"))
    dept_overdue = list(
        overdue_qs.values("report__department__name").annotate(c=Count("id")).order_by("-c")[:10]
    )
    return {
        "total": qs.count(),
        "by_status": {row["status"]: row["c"] for row in status_rows},
        "by_risk": {row["risk_level"]: row["c"] for row in risk_rows},
        "overdue": _bucket(overdue_qs.order_by("action_plan__target_date")),
        "approaching_deadline": _bucket(approaching_qs.order_by("action_plan__target_date")),
        "high_risk_open": _bucket(
            qs.filter(risk_level=Recommendation.RiskLevel.HIGH).exclude(status__in=(S.CLOSED,))
        ),
        "awaiting_verification": _bucket(qs.filter(status=S.SUBMITTED_FOR_VERIFICATION)),
        "pending_response": _bucket(
            qs.filter(status__in=(S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION))
        ),
        "in_progress": _bucket(
            qs.filter(
                status__in=(
                    S.IN_PROGRESS,
                    S.ACTION_PLAN_APPROVED,
                    S.PARTIAL,
                    S.REOPENED,
                    S.RETURNED_INSUFFICIENT,
                )
            )
        ),
        "pending_council": _bucket(
            qs.filter(status__in=(S.PENDING_COUNCIL, S.PENDING_CLOSURE_COUNCIL))
        ),
        "closure_review": _bucket(qs.filter(status=S.CLOSURE_REVIEW)),
        "recurring": _bucket(qs.filter(is_recurring=True)),
        "insufficient_evidence": _bucket(
            qs.filter(verifications__decision=VerificationDecision.Decision.INSUFFICIENT).distinct()
        ),
        "department_overdue": [
            {"department": row["report__department__name"], "count": row["c"]} for row in dept_overdue
        ],
    }


def tool_why_high_risk(user, rec_id: int):
    rec = (
        _qs(user)
        .prefetch_related("action_plan__steps", "evidence_files", "verifications", "trail_entries")
        .filter(pk=rec_id)
        .first()
    )
    if rec is None:
        return {"error": "not_found_or_unauthorized"}
    estimate = delay_risk_score_only(rec)
    facts = recommendation_public_facts(rec)
    facts["recorded_risk_level"] = rec.risk_level
    facts["delay_estimate"] = {
        "delay_risk_score": estimate["delay_risk_score"],
        "risk_level": estimate["risk_level"],
        "factors": estimate["factors"],
        "wording": estimate["wording"],
    }
    return facts


TOOLS = {
    "get_portfolio": lambda user, args: tool_get_portfolio(user),
    "get_recommendation": lambda user, args: tool_get_recommendation(user, int(args.get("id") or 0)),
    "search_recommendations": lambda user, args: tool_search_recommendations(
        user, args.get("query") or "", args.get("department") or "", args.get("status") or ""
    ),
    "get_department_statistics": lambda user, args: tool_get_department_statistics(
        user, args.get("department") or ""
    ),
    "get_overdue_recommendations": lambda user, args: tool_get_overdue_recommendations(user),
    "get_recurring_findings": lambda user, args: tool_get_recurring_findings(user),
    "get_action_plan_status": lambda user, args: tool_get_action_plan_status(user, int(args.get("id") or 0)),
    "get_evidence_status": lambda user, args: tool_get_evidence_status(user, int(args.get("id") or 0)),
    "get_audit_history": lambda user, args: tool_get_audit_history(user, int(args.get("id") or 0)),
    "get_followup_reports": lambda user, args: tool_get_followup_reports(user),
    "get_approaching_deadlines": lambda user, args: tool_get_approaching_deadlines(user),
    "get_insufficient_verification": lambda user, args: tool_get_insufficient_verification(user),
    "why_high_risk": lambda user, args: tool_why_high_risk(user, int(args.get("id") or 0)),
}


def _route_tools(message: str) -> list[tuple[str, dict]]:
    text = message or ""
    calls = [("get_portfolio", {})]
    rec_ids = [int(x) for x in REC_ID.findall(text)]
    low = text.lower()

    if rec_ids:
        rid = rec_ids[0]
        calls.append(("get_recommendation", {"id": rid}))
        if re.search(r"خطر|risk|لماذا|why", low):
            calls.append(("why_high_risk", {"id": rid}))
        if re.search(r"خطة|plan", low):
            calls.append(("get_action_plan_status", {"id": rid}))
        if re.search(r"دليل|evidence", low):
            calls.append(("get_evidence_status", {"id": rid}))
        if re.search(r"سجل|history|trail", low):
            calls.append(("get_audit_history", {"id": rid}))

    if re.search(r"متأخر|تأخر|تأخير|overdue", low):
        calls.append(("get_overdue_recommendations", {}))
    if re.search(r"تكرار|recurring", low):
        calls.append(("get_recurring_findings", {}))
    if re.search(r"موعد|deadline|approaching", low):
        calls.append(("get_approaching_deadlines", {}))
    if re.search(r"غير كاف|insufficient", low):
        calls.append(("get_insufficient_verification", {}))
    if re.search(r"متابع|follow-?up", low):
        calls.append(("get_followup_reports", {}))
    if re.search(r"دائرة|دوائر|إدار|ادار|department", low):
        calls.append(("get_department_statistics", {}))

    dept = None
    m = re.search(r"(المشتريات|المالية|الهندس\w*|procurement|finance|engineering)", low)
    if m:
        dept = m.group(1)
        calls.append(("get_department_statistics", {"department": dept}))

    query = _name_query(text)
    if query:
        calls.append(("search_recommendations", {"query": query, "department": "", "status": ""}))

    seen, unique = set(), []
    for name, args in calls:
        key = (name, json.dumps(args, sort_keys=True))
        if key not in seen:
            seen.add(key)
            unique.append((name, args))
    return unique


def _collect_allowed_ids(tool_results: dict) -> set[int]:
    ids = set()

    def walk(node):
        if isinstance(node, dict):
            if "id" in node and isinstance(node["id"], int):
                ids.add(node["id"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(tool_results)
    return ids


def _search_matches(results: dict) -> list:
    raw = results.get("search_recommendations")
    if isinstance(raw, dict):
        matches = raw.get("matches") or []
        return matches if isinstance(matches, list) else []
    if isinstance(raw, list):
        return raw
    return []


def _fmt_items(items: list, ar: bool, limit=8) -> str:
    bits = []
    for item in (items or [])[:limit]:
        label = item.get("title") or (item.get("text") or "")[:70]
        ref = item.get("reference") or f"REC-{item.get('id')}"
        bits.append(f"{ref} — {label}" if label else str(ref))
    if not bits:
        return "لا يوجد" if ar else "none"
    return "؛ ".join(bits) if ar else "; ".join(bits)


def _local_answer(message: str, results: dict, language: str) -> str:
    ar = language != "en"
    low = (message or "").lower()
    parts = []
    portfolio = results.get("get_portfolio") if isinstance(results.get("get_portfolio"), dict) else {}

    if INJECTION.search(message or ""):
        parts.append(
            "طلبك يحتوي عبارات تتجاوز صلاحيات المساعد. سأجيب فقط من بيانات النظام المصرّح بها."
            if ar
            else "The request includes instruction-override language. Answers use only authorized system data."
        )

    name_q = _name_query(message or "")
    hits = _search_matches(results)
    if name_q:
        if hits:
            parts.append(
                f"نعم، وُجدت {len(hits)} توصية مطابقة لـ «{name_q}»: {_fmt_items(hits, ar)}."
                if ar
                else f"Yes, {len(hits)} recommendation(s) match “{name_q}”: {_fmt_items(hits, ar)}."
            )
        else:
            parts.append(
                f"لا توجد توصية ضمن صلاحياتك بالاسم أو النص «{name_q}»."
                if ar
                else f"No recommendation in your scope matches the name or text “{name_q}”."
            )

    rec = results.get("get_recommendation")
    if isinstance(rec, dict) and rec.get("error"):
        parts.append(
            "هذه التوصية غير موجودة ضمن صلاحياتك."
            if ar
            else "That recommendation is not in your access scope."
        )
    elif isinstance(rec, dict) and rec.get("reference"):
        title = rec.get("title") or ""
        title_bit = f" بعنوان «{title}»" if title and ar else (f" titled “{title}”" if title else "")
        parts.append(
            f"{rec['reference']}{title_bit} حالتها {rec.get('status')} وخطورتها المسجّلة {rec.get('risk_level')} "
            f"في دائرة {rec.get('department')}."
            if ar
            else f"{rec['reference']}{title_bit} is in status {rec.get('status')} with recorded risk {rec.get('risk_level')} "
            f"in {rec.get('department')}."
        )

    why = results.get("why_high_risk")
    if isinstance(why, dict) and why.get("delay_estimate"):
        est = why["delay_estimate"]
        if est.get("wording"):
            parts.append(est["wording"])
        if est.get("factors"):
            parts.append(("العوامل: " if ar else "Factors: ") + "؛ ".join(est["factors"][:5]))

    overdue = portfolio.get("overdue") if isinstance(portfolio.get("overdue"), dict) else None
    if overdue is None and isinstance(results.get("get_overdue_recommendations"), list):
        items = results["get_overdue_recommendations"]
        overdue = {"count": len(items), "items": items}
    if re.search(r"متأخر|تأخر|تأخير|overdue", low) and overdue:
        count = overdue.get("count") or 0
        items = overdue.get("items") or []
        if count:
            parts.append(
                f"عدد التوصيات المتأخرة ضمن صلاحياتك: {count}. منها: {_fmt_items(items, ar)}."
                if ar
                else f"{count} overdue recommendation(s) in your scope, including: {_fmt_items(items, ar)}."
            )
        else:
            parts.append("لا توجد توصيات متأخرة ضمن نطاق صلاحياتك." if ar else "No overdue recommendations in your scope.")

    if re.search(r"تحقق|verif", low) and not REC_ID.search(message or "") and not re.search(r"غير كاف|insufficient", low):
        bucket = portfolio.get("awaiting_verification") or {}
        count = bucket.get("count") or 0
        items = bucket.get("items") or []
        if count:
            parts.append(
                f"التوصيات التي تحتاج تحقق حالياً: {count}. هي: {_fmt_items(items, ar)}."
                if ar
                else f"{count} recommendation(s) currently await verification: {_fmt_items(items, ar)}."
            )
        else:
            parts.append(
                "لا توجد توصيات بانتظار التحقق حالياً ضمن صلاحياتك."
                if ar
                else "No recommendations currently await verification in your scope."
            )

    if re.search(r"غير كاف|insufficient", low):
        bucket = portfolio.get("insufficient_evidence") or {}
        items = results.get("get_insufficient_verification") if isinstance(results.get("get_insufficient_verification"), list) else bucket.get("items") or []
        count = bucket.get("count") if bucket else len(items)
        parts.append(
            f"توصيات بتحقق أدلة غير كافٍ: {count or 0}."
            if ar
            else f"Recommendations with insufficient verification: {count or 0}."
        )

    if re.search(r"خطر|خطورة|high.?risk", low) and not REC_ID.search(message or ""):
        bucket = portfolio.get("high_risk_open") or {}
        count = bucket.get("count") or 0
        items = bucket.get("items") or []
        parts.append(
            f"التوصيات المفتوحة عالية الخطورة: {count}. {_fmt_items(items, ar) if count else ''}".strip()
            if ar
            else f"Open high-risk recommendations: {count}. {_fmt_items(items, ar) if count else ''}".strip()
        )

    if re.search(r"تكرار|recurring", low):
        bucket = portfolio.get("recurring") or {}
        count = bucket.get("count") or 0
        parts.append(
            f"عدد التكرارات المرصودة ضمن نطاقك: {count}."
            if ar
            else f"Recurring findings in your scope: {count}."
        )

    if re.search(r"موعد|deadline|approaching", low):
        bucket = portfolio.get("approaching_deadline") or {}
        count = bucket.get("count") or 0
        parts.append(
            f"توصيات تقترب من موعدها خلال 14 يوماً: {count}."
            if ar
            else f"Recommendations approaching deadline within 14 days: {count}."
        )

    if re.search(r"دائرة|دوائر|إدار|ادار|department", low):
        rows = portfolio.get("department_overdue") or []
        if rows:
            listed = "؛ ".join(f"{row.get('department')} ({row.get('count')})" for row in rows[:6])
            parts.append(
                f"أعلى تأخير حسب الدائرة: {listed}."
                if ar
                else f"Highest delays by department: {listed}."
            )
        else:
            parts.append("لا يوجد تأخير موزّع على الدوائر حالياً." if ar else "No department overdue concentration currently.")

    followup = results.get("get_followup_reports")
    if isinstance(followup, list):
        parts.append(
            f"تقارير المتابعة المتاحة: {len(followup)}."
            if ar
            else f"Follow-up reports available: {len(followup)}."
        )
    elif isinstance(followup, dict) and followup.get("error"):
        parts.append("تقارير المتابعة غير متاحة لهذا الدور." if ar else "Follow-up reports are not available for this role.")

    if not parts and portfolio:
        total = portfolio.get("total") or 0
        overdue_n = (portfolio.get("overdue") or {}).get("count") or 0
        verify_n = (portfolio.get("awaiting_verification") or {}).get("count") or 0
        high_n = (portfolio.get("high_risk_open") or {}).get("count") or 0
        parts.append(
            f"ضمن صلاحياتك حالياً {total} توصية: المتأخرة {overdue_n}، بانتظار التحقق {verify_n}، عالية الخطورة {high_n}."
            if ar
            else f"In your scope there are currently {total} recommendations: {overdue_n} overdue, {verify_n} awaiting verification, {high_n} high risk."
        )

    if not parts:
        parts.append(
            "لا تتوفر معلومات كافية في النظام لتحديد ذلك."
            if ar
            else "I don't have enough information in the system to determine that."
        )
    parts.append(
        "هذه إجابة استشارية ولا تغيّر حالة سير العمل."
        if ar
        else "This is advisory and does not change workflow status."
    )
    return "\n".join(p for p in parts if p)


def get_or_create_conversation(user) -> AIConversation:
    convo = (
        AIConversation.objects.filter(user=user, municipality=user.municipality, role=user.role)
        .order_by("-updated_at")
        .first()
    )
    if convo:
        return convo
    return AIConversation.objects.create(
        user=user,
        municipality=user.municipality,
        role=user.role,
        title="Audit AI Assistant",
    )


def clear_conversation(user):
    AIConversation.objects.filter(user=user, municipality=user.municipality).delete()


def run_assistant(user, message: str, language: str = "ar", conversation_id: int | None = None) -> dict:
    lang = language_of(language)
    if conversation_id:
        convo = AIConversation.objects.filter(
            pk=conversation_id, user=user, municipality=user.municipality
        ).first()
        if convo is None:
            convo = get_or_create_conversation(user)
    else:
        convo = get_or_create_conversation(user)

    AIMessage.objects.create(conversation=convo, role=AIMessage.Role.USER, content=message[:4000])

    calls = _route_tools(message)
    tool_results = {}
    for name, args in calls:
        fn = TOOLS.get(name)
        if not fn:
            continue
        try:
            tool_results[name] = fn(user, args)
        except Exception:
            tool_results[name] = {"error": "tool_failed"}

    local = _local_answer(message, tool_results, lang)
    prompt = render_prompt(
        "assistant_v1.txt",
        language="Modern Standard Arabic" if lang == "ar" else "English",
        trusted_json=json.dumps(tool_results, ensure_ascii=False)[:12000],
        user_message=scrub_text(message, 1500),
    )
    llm_out = generate_structured(
        prompt,
        fallback={"answer": local, "used_tools": list(tool_results.keys())},
    )
    answer = local
    name_q = _name_query(message)
    portfolio = tool_results.get("get_portfolio") if isinstance(tool_results.get("get_portfolio"), dict) else {}
    if isinstance(llm_out.get("answer"), str) and llm_out["answer"].strip():
        candidate = llm_out["answer"].strip()
        allowed = _collect_allowed_ids(tool_results)
        invented = any(int(token) not in allowed for token in REC_ID.findall(candidate))
        hits = _search_matches(tool_results)
        refs = [item.get("reference") for item in hits if item.get("reference")]
        talks_about_name = bool(re.search(r"بهذا الاسم|بالاسم أو النص|with this name|matches the name", candidate, re.I))
        denies_all = bool(re.search(r"لا أملك معلومات|don't have enough|no information in the system", candidate, re.I))
        ignored_hits = bool(refs) and not any(ref in candidate for ref in refs)
        if (
            not invented
            and not ignored_hits
            and not (talks_about_name and not name_q)
            and not (denies_all and (portfolio.get("total") or 0) > 0)
        ):
            answer = candidate[:4000]
    meta = provider_meta()
    AIMessage.objects.create(
        conversation=convo,
        role=AIMessage.Role.ASSISTANT,
        content=answer,
        metadata={"tools": list(tool_results.keys()), "provider": meta["provider"], "model": meta["model"]},
    )
    convo.save(update_fields=["updated_at"])
    history = [
        {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
        for m in convo.messages.order_by("created_at")[:40]
    ]
    return {
        "conversation_id": convo.id,
        "answer": answer,
        "tools": list(tool_results.keys()),
        "tool_results": tool_results,
        "provider": meta["provider"],
        "model": meta["model"],
        "advisory": True,
        "messages": history,
    }
