"""Internal audit assistant with server-side tools only. No raw SQL. RBAC on every tool."""
from __future__ import annotations

import json
import re
import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.ai.models import AIConversation, AIMessage
from apps.ai.providers import provider_meta
from apps.ai.services.case_copy import next_action, risk_label, status_label
from apps.ai.services.common import generate_structured, language_of
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.risk_engine import delay_risk_score_only
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text
from apps.audits.finding import case_title
from apps.audits.models import Recommendation
from apps.audits.serializers import is_overdue
from apps.core.permissions import scope_recommendations
from apps.followup.models import FollowUpReport
from apps.workflow.models import VerificationDecision

logger = logging.getLogger("apps.ai")

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
GENERIC_DUMP = re.compile(
    r"ضمن صلاحياتك حالياً\s+\d+\s+توصية|In your scope there are currently\s+\d+\s+recommendations",
    re.I,
)
OVERVIEW_RE = re.compile(
    r"ملخص|إحصائ|احصائ|صورة عامة|كم توصية عند|كم عدد التوصيات|عدد التوصيات|"
    r"how many recommendations|overview|portfolio snapshot|what do i have",
    re.I,
)
LIST_RE = re.compile(
    r"كل التوصيات|جميع التوصيات|اعرض(?:ي)? التوصيات|أظهر التوصيات|قائمة التوصيات|"
    r"list (all )?recommendations|show (all )?recommendations",
    re.I,
)
GREETING_RE = re.compile(
    r"^(مرحباً?|أهلاً?|اهلا|السلام عليكم|سلام|hi+|hello|hey|صباح الخير|مساء الخير|"
    r"شكراً?|thanks|thank you)[\s!.،,]*$",
    re.I,
)
HELP_RE = re.compile(
    r"ماذا تستطيع|ما الذي تستطيع|ماذا يمكنك|كيف أستخدم|كيف استخدم|شو بتقدر|help\b|"
    r"what can you (do|answer)",
    re.I,
)
WHY_RE = re.compile(r"لماذا|ليش|سبب|أسباب|اسباب|\bwhy\b", re.I)
FOLLOWUP_RE = re.compile(
    r"تفاصيل|هذه التوصية|هذا الملف|هذي|هاي التوصية|السابق|نفس التوصية|"
    r"more details|tell me more|that one",
    re.I,
)
STOPWORDS = {
    "هل", "في", "فيه", "ما", "هي", "هو", "هم", "عن", "من", "إلى", "الى", "على", "و",
    "أو", "او", "ثم", "قد", "لم", "لن", "لا", "يا", "أي", "اى", "التي", "الذي", "الذين",
    "هذا", "هذه", "ذلك", "تلك", "هناك", "هنا", "الان", "الآن", "حاليا", "حالياً",
    "كم", "قديش", "وين", "شو", "ليش", "لماذا", "كيف", "متى", "أين", "اين",
    "أظهر", "اظهر", "أعرض", "اعرض", "عرض", "قائمة", "القائمة", "لي",
    "أريد", "اريد", "ممكن", "الرجاء", "رجاء", "يرجى",
    "أخبرني", "اخبرني", "قلي", "احكي", "وضح", "اشرح", "شرح",
    "التوصية", "توصية", "التوصيات", "توصيات", "توصيه", "التوصيه",
    "recommendation", "recommendations", "please", "what", "which", "where",
    "when", "how", "why", "show", "list", "tell", "give", "me", "my", "the",
    "a", "an", "are", "is", "of", "in", "for", "and", "or", "to", "do", "does",
    "about", "regarding", "need", "needs", "require", "requires", "current",
    "currently", "all", "any", "some", "those", "these", "that", "this",
    "عندي", "عندنا", "كلها", "كل", "موجود", "موجودة", "توجد", "يوجد",
    "تحتاج", "يحتاج", "معلومات", "تفاصيل", "عنها", "عنه", "فقط",
}
INTENT_STOP = {
    "متأخر", "متأخرة", "المتأخرة", "المتأخر", "تأخر", "تأخير", "تاخير",
    "overdue", "delay", "delayed", "late",
    "خطر", "خطورة", "الخطورة", "عالية", "مرتفع", "مرتفعة", "risk", "high",
    "تحقق", "التحقق", "verification", "verify",
    "تكرار", "التكرار", "تكرارات", "التكرارات", "recurring", "recurrence",
    "موعد", "الموعد", "مواعيد", "المواعيد", "deadline", "deadlines", "upcoming",
    "دائرة", "الدائرة", "دوائر", "الدوائر", "إدارة", "ادارة", "الإدارة",
    "الادارة", "إدارات", "ادارات", "department", "departments",
    "كاف", "كافية", "insufficient",
    "متابعة", "المتابعة", "followup", "follow",
    "ملخص", "إحصائيات", "احصائيات", "overview", "summary",
}

ADVISORY_AR = "هذه إجابة استشارية ولا تغيّر حالة سير العمل."
ADVISORY_EN = "This is advisory and does not change workflow status."
CAPABILITIES_AR = (
    "يمكنني المساعدة في: التوصيات المتأخرة وسبب التأخير، عالية الخطورة، "
    "بانتظار التحقق، التكرارات، المواعيد القريبة، الإدارات الأكثر تأخراً، "
    "أو البحث عن توصية بالاسم أو بالرقم مثل REC-12."
)
CAPABILITIES_EN = (
    "I can help with: overdue recommendations and why they are late, high-risk items, "
    "items awaiting verification, recurrences, upcoming deadlines, departments with the most delays, "
    "or a recommendation by name or number such as REC-12."
)


def _qs(user):
    qs = scope_recommendations(
        Recommendation.objects.select_related(
            "report__department", "report", "action_plan__responsible_employee"
        ),
        user,
    )
    if user.role != "audit":
        qs = qs.exclude(status=S.DRAFT)
    return qs


def _display_title(text: str) -> str:
    return case_title(text, 120)


def _name_query(message: str) -> str:
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
    overdue = is_overdue(rec)
    days_overdue = 0
    if overdue and plan and plan.target_date:
        days_overdue = (timezone.localdate() - plan.target_date).days
    return {
        "id": rec.id,
        "reference": f"REC-{rec.id}",
        "title": _display_title(rec.text),
        "text": (rec.text or "")[:240],
        "status": rec.status,
        "risk_level": rec.risk_level,
        "department": rec.report.department.name,
        "overdue": overdue,
        "has_plan": plan is not None,
        "days_overdue": days_overdue,
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
    tokens = re.findall(r"[A-Za-z0-9_\u0600-\u06FF]{2,}", term)[:8]
    if tokens:
        combined = (
            Q(text__icontains=tokens[0])
            | Q(root_cause__icontains=tokens[0])
            | Q(report__title__icontains=tokens[0])
            | Q(report__department__name__icontains=tokens[0])
        )
        for tok in tokens[1:]:
            combined &= (
                Q(text__icontains=tok)
                | Q(root_cause__icontains=tok)
                | Q(report__title__icontains=tok)
                | Q(report__department__name__icontains=tok)
            )
        qs = qs.filter(combined)
    if department:
        qs = qs.filter(report__department__name__icontains=department[:80])
    if status:
        qs = qs.filter(status=status)
    matches = [_brief(rec) for rec in qs.distinct()[:15]]
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


def _topic_query(message: str) -> str:
    tokens = re.findall(r"[A-Za-z0-9_\u0600-\u06FF]{2,}", message or "")
    kept = []
    for tok in tokens:
        key = tok.lower()
        if key in STOPWORDS or key in INTENT_STOP:
            continue
        kept.append(tok)
        if len(kept) >= 6:
            break
    if not kept or all(t.isdigit() for t in kept):
        return ""
    return " ".join(kept)[:80]


def _parse_query(message: str) -> dict:
    text = message or ""
    low = text.lower()
    kinds: set[str] = set()
    if INJECTION.search(text):
        kinds.add("injection")
    rec_ids = [int(x) for x in REC_ID.findall(text)]
    name_q = _name_query(text)

    if GREETING_RE.search(text.strip()):
        kinds.add("greeting")
    if HELP_RE.search(text):
        kinds.add("help")
    if WHY_RE.search(text):
        kinds.add("why")
    if re.search(r"متأخر|تأخر|تأخير|overdue|delay", low):
        kinds.add("overdue")
    if re.search(r"خطر|خطورة|high.?risk", low):
        kinds.add("high_risk")
    if re.search(r"غير كاف|insufficient", low):
        kinds.add("insufficient")
    elif re.search(r"تحقق|verif", low):
        kinds.add("verification")
    if re.search(r"تكرار|recurring", low):
        kinds.add("recurring")
    if re.search(r"موعد|deadline|approaching", low):
        kinds.add("deadlines")
    if re.search(r"دائرة|دوائر|إدار|ادار|department", low):
        kinds.add("departments")
    if re.search(r"متابع|follow-?up", low):
        kinds.add("followup")
    if OVERVIEW_RE.search(text):
        kinds.add("overview")
    if LIST_RE.search(text) and not (kinds & {"overdue", "high_risk", "verification", "recurring", "insufficient"}):
        kinds.add("list")

    topic_q = ""
    if name_q:
        kinds.add("search")
    elif rec_ids:
        kinds.add("rec")
    elif not (kinds & {
        "overdue", "high_risk", "verification", "recurring", "deadlines", "departments", "followup", "overview", "list", "greeting", "help"
    }):
        topic_q = _topic_query(text)
        if topic_q:
            kinds.add("search")
        else:
            kinds.add("unclear")

    return {
        "kinds": kinds,
        "rec_ids": rec_ids,
        "name_query": name_q,
        "topic_query": topic_q,
        "department": None,
    }


def _followup_rec_ids(message: str, history: list[dict]) -> list[int]:
    text = (message or "").strip()
    if not text or REC_ID.search(text) or not FOLLOWUP_RE.search(text):
        return []
    for item in reversed(history or []):
        if item.get("role") != "assistant":
            continue
        ids = [int(x) for x in REC_ID.findall(item.get("content") or "")]
        if ids:
            return ids[:1]
    return []


def _unique_calls(calls: list[tuple[str, dict]]) -> list[tuple[str, dict]]:
    seen, unique = set(), []
    for name, args in calls:
        key = (name, json.dumps(args, sort_keys=True))
        if key not in seen:
            seen.add(key)
            unique.append((name, args))
    return unique


def _route_tools(parsed: dict, message: str) -> list[tuple[str, dict]]:
    text = message or ""
    low = text.lower()
    kinds = parsed["kinds"]
    rec_ids = list(parsed["rec_ids"])
    calls = [("get_portfolio", {})]

    if rec_ids:
        rid = rec_ids[0]
        calls.append(("get_recommendation", {"id": rid}))
        if "high_risk" in kinds or "why" in kinds or re.search(r"خطر|risk", low):
            calls.append(("why_high_risk", {"id": rid}))
        if re.search(r"خطة|plan", low):
            calls.append(("get_action_plan_status", {"id": rid}))
        if re.search(r"دليل|evidence", low):
            calls.append(("get_evidence_status", {"id": rid}))
        if re.search(r"سجل|history|trail", low):
            calls.append(("get_audit_history", {"id": rid}))

    if "overdue" in kinds:
        calls.append(("get_overdue_recommendations", {}))
    if "recurring" in kinds:
        calls.append(("get_recurring_findings", {}))
    if "deadlines" in kinds:
        calls.append(("get_approaching_deadlines", {}))
    if "insufficient" in kinds:
        calls.append(("get_insufficient_verification", {}))
    if "followup" in kinds:
        calls.append(("get_followup_reports", {}))
    if "departments" in kinds:
        calls.append(("get_department_statistics", {}))

    dept = None
    m = re.search(r"(المشتريات|المالية|الهندس\w*|procurement|finance|engineering)", low)
    if m:
        dept = m.group(1)
        parsed["department"] = dept
        calls.append(("get_department_statistics", {"department": dept}))

    query = parsed["name_query"] or parsed["topic_query"]
    if query or "list" in kinds:
        calls.append(("search_recommendations", {"query": query or "", "department": "", "status": ""}))

    return _unique_calls(calls)


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
    lang = "ar" if ar else "en"
    bits = []
    for item in (items or []):
        label = item.get("title") or (item.get("text") or "")[:70]
        ref = item.get("reference") or f"REC-{item.get('id')}"
        st = status_label(item.get("status") or "", lang) if item.get("status") else ""
        core = f"{ref} — {label}" if label else str(ref)
        if st:
            core = f"{core} ({st})"
        bits.append(core)
    if not bits:
        return "لا يوجد" if ar else "none"
    return "؛ ".join(bits[:limit]) if ar else "; ".join(bits[:limit])


def _with_advisory(text: str, ar: bool) -> str:
    note = ADVISORY_AR if ar else ADVISORY_EN
    blob = (text or "").strip()
    if not blob:
        return note
    if note in blob or "استشارية" in blob or "advisory" in blob.lower():
        return blob
    return blob + "\n" + note


def _capabilities(ar: bool) -> str:
    return CAPABILITIES_AR if ar else CAPABILITIES_EN


def _result_bucket(results: dict, portfolio: dict, key: str, fallback_tool: str = ""):
    bucket = portfolio.get(key) if isinstance(portfolio.get(key), dict) else None
    if bucket is None and fallback_tool:
        raw = results.get(fallback_tool)
        if isinstance(raw, list):
            bucket = {"count": len(raw), "items": raw}
    return bucket or {}


def _why_overdue_lines(items: list, ar: bool) -> str:
    lines = []
    lang = "ar" if ar else "en"
    for item in (items or [])[:6]:
        ref = item.get("reference") or f"REC-{item.get('id')}"
        reasons = []
        days = item.get("days_overdue") or 0
        if days:
            reasons.append(
                f"تجاوز الموعد المستهدف منذ {days} يوماً ({item.get('target_date')})"
                if ar
                else f"{days} day(s) past the target date ({item.get('target_date')})"
            )
        elif item.get("target_date"):
             reasons.append(
                f"الموعد المستهدف {item.get('target_date')}"
                if ar
                else f"target date {item.get('target_date')}"
            )
        if not item.get("has_plan"):
            reasons.append("لا توجد خطة عمل معتمدة" if ar else "no approved action plan")
        nxt = next_action(item.get("status") or "", lang)
        if nxt:
            reasons.append(("الإجراء التالي: " if ar else "next: ") + nxt)
        if reasons:
            lines.append(f"{ref}: " + ("؛ ".join(reasons) if ar else "; ".join(reasons)))
    return "\n".join(lines)


def _overview_line(portfolio: dict, ar: bool) -> str:
    total = portfolio.get("total") or 0
    overdue_n = (portfolio.get("overdue") or {}).get("count") or 0
    verify_n = (portfolio.get("awaiting_verification") or {}).get("count") or 0
    high_n = (portfolio.get("high_risk_open") or {}).get("count") or 0
    if ar:
        return (
            f"ضمن صلاحياتك حالياً {total} توصية: المتأخرة {overdue_n}، "
            f"بانتظار التحقق {verify_n}، عالية الخطورة {high_n}."
        )
    return (
        f"In your scope there are currently {total} recommendations: {overdue_n} overdue, "
        f"{verify_n} awaiting verification, {high_n} high risk."
    )


def _local_answer(message: str, results: dict, language: str, parsed: dict | None = None) -> str:
    ar = language != "en"
    parsed = parsed or _parse_query(message)
    kinds = parsed["kinds"]
    parts = []
    portfolio = results.get("get_portfolio") if isinstance(results.get("get_portfolio"), dict) else {}
    hits = _search_matches(results)
    query = parsed.get("name_query") or parsed.get("topic_query") or ""

    if "injection" in kinds:
        parts.append(
            "طلبك يحتوي عبارات تتجاوز صلاحيات المساعد. سأجيب فقط من بيانات النظام المصرّح بها."
            if ar
            else "The request includes instruction-override language. Answers use only authorized system data."
        )

    greeting_only = kinds <= {"greeting", "injection"} and "greeting" in kinds
    help_only = "help" in kinds and not (kinds & {"overdue", "high_risk", "verification", "recurring", "deadlines", "departments", "search", "rec", "overview", "list"})
    if greeting_only:
        parts.append(
            "أهلاً، أنا مساعد التدقيق. " + _capabilities(True)
            if ar
            else "Hello, I am the audit assistant. " + _capabilities(False)
        )
    elif help_only:
        parts.append(_capabilities(ar))

    if query and "search" in kinds:
        if hits:
            parts.append(
                f"نعم، وُجدت {len(hits)} توصية مطابقة لـ «{query}»: {_fmt_items(hits, ar)}."
                if ar
                else f"Yes, {len(hits)} recommendation(s) match “{query}”: {_fmt_items(hits, ar)}."
            )
        else:
            parts.append(
                f"لم أجد توصية تطابق «{query}». {_capabilities(True)}"
                if ar
                else f"No recommendation matches “{query}”. {_capabilities(False)}"
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
        st = status_label(rec.get("status") or "", language)
        rk = risk_label(rec.get("risk_level") or "", language)
        title_bit = f" بعنوان «{title}»" if title and ar else (f" titled “{title}”" if title else "")
        parts.append(
            f"{rec['reference']}{title_bit} حالتها {st} وخطورتها المسجّلة {rk} في دائرة {rec.get('department')}."
            if ar
            else f"{rec['reference']}{title_bit} is in status {st} with recorded risk {rk} in {rec.get('department')}."
        )
        nxt = next_action(rec.get("status") or "", language)
        if nxt:
            parts.append(("الإجراء التالي: " if ar else "Next action: ") + nxt)

    why = results.get("why_high_risk")
    if isinstance(why, dict) and why.get("delay_estimate"):
        est = why["delay_estimate"]
        if est.get("wording"):
            parts.append(est["wording"])
        if est.get("factors"):
            parts.append(("العوامل: " if ar else "Factors: ") + "؛ ".join(est["factors"][:5]))

    overdue = _result_bucket(results, portfolio, "overdue", "get_overdue_recommendations")
    if "overdue" in kinds:
        count = overdue.get("count") or 0
        items = overdue.get("items") or []
        if count:
            parts.append(
                f"عدد التوصيات المتأخرة ضمن صلاحياتك: {count}. منها: {_fmt_items(items, ar)}."
                if ar
                else f"{count} overdue recommendation(s) in your scope, including: {_fmt_items(items, ar)}."
            )
            if "why" in kinds:
                explained = _why_overdue_lines(items, ar)
                if explained:
                    parts.append(("سبب التأخير: " if ar else "Why they are late:\n") + explained)
        elif "why" in kinds:
            approaching = (portfolio.get("approaching_deadline") or {}).get("count") or 0
            extra = ""
            if approaching:
                extra = (
                    f" هناك {approaching} توصية تقترب من موعدها خلال 14 يوماً."
                    if ar
                    else f" {approaching} recommendation(s) approach a deadline within 14 days."
                )
            parts.append(
                "لا توجد توصيات متأخرة عن موعدها المستهدف حالياً. "
                "يُحسب التأخير بعد اعتماد خطة عمل ومرور ذلك الموعد."
                + extra
                if ar
                else "No recommendations are past their target date. Delay is counted after an action plan exists and that date has passed."
                + extra
            )
        else:
            parts.append("لا توجد توصيات متأخرة ضمن نطاق صلاحياتك." if ar else "No overdue recommendations in your scope.")

    if "verification" in kinds and "rec" not in kinds:
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

    if "insufficient" in kinds:
        bucket = portfolio.get("insufficient_evidence") or {}
        items = results.get("get_insufficient_verification") if isinstance(results.get("get_insufficient_verification"), list) else bucket.get("items") or []
        count = bucket.get("count") if bucket else len(items)
        listed = _fmt_items(items, ar)
        parts.append(
            f"توصيات بتحقق أدلة غير كافٍ: {count or 0}." + (f" {listed}" if listed and listed != "لا يوجد" else "")
            if ar
            else f"Recommendations with insufficient verification: {count or 0}." + (f" {listed}" if listed and listed != "none" else "")
        )

    if "high_risk" in kinds and "rec" not in kinds:
        bucket = portfolio.get("high_risk_open") or {}
        count = bucket.get("count") or 0
        items = bucket.get("items") or []
        if count:
            parts.append(
                f"التوصيات المفتوحة عالية الخطورة: {count}. {_fmt_items(items, ar)}"
                if ar
                else f"Open high-risk recommendations: {count}. {_fmt_items(items, ar)}"
            )
        else:
            parts.append(
                "لا توجد توصيات مفتوحة عالية الخطورة ضمن صلاحياتك."
                if ar
                else "No open high-risk recommendations in your scope."
            )

    if "recurring" in kinds:
        bucket = portfolio.get("recurring") or {}
        count = bucket.get("count") or 0
        items = bucket.get("items") or []
        parts.append(
            f"عدد التكرارات المرصودة ضمن نطاقك: {count}." + (f" {_fmt_items(items, ar)}" if count else "")
            if ar
            else f"Recurring findings in your scope: {count}." + (f" {_fmt_items(items, ar)}" if count else "")
        )

    if "deadlines" in kinds:
        bucket = portfolio.get("approaching_deadline") or {}
        count = bucket.get("count") or 0
        items = bucket.get("items") or []
        parts.append(
            f"توصيات تقترب من موعدها خلال 14 يوماً: {count}." + (f" {_fmt_items(items, ar)}" if count else "")
            if ar
            else f"Recommendations approaching deadline within 14 days: {count}." + (f" {_fmt_items(items, ar)}" if count else "")
        )

    if "departments" in kinds:
        rows = portfolio.get("department_overdue") or []
        stats = results.get("get_department_statistics")
        if rows:
            listed = "؛ ".join(f"{row.get('department')} ({row.get('count')})" for row in rows[:6])
            parts.append(
                f"أعلى تأخير حسب الدائرة: {listed}."
                if ar
                else f"Highest delays by department: {listed}."
            )
        else:
            parts.append("لا يوجد تأخير موزّع على الدوائر حالياً." if ar else "No department overdue concentration currently.")
        if isinstance(stats, dict) and parsed.get("department") and stats.get("total") is not None:
            parts.append(
                f"إحصاء الدائرة «{stats.get('department')}»: الإجمالي {stats.get('total')}، المفتوحة {stats.get('open')}، المتأخرة {stats.get('overdue')}."
                if ar
                else f"Department “{stats.get('department')}”: total {stats.get('total')}, open {stats.get('open')}, overdue {stats.get('overdue')}."
            )

    followup = results.get("get_followup_reports")
    if isinstance(followup, list) and "followup" in kinds:
        parts.append(
            f"تقارير المتابعة المتاحة: {len(followup)}."
            if ar
            else f"Follow-up reports available: {len(followup)}."
        )
    elif isinstance(followup, dict) and followup.get("error"):
        parts.append("تقارير المتابعة غير متاحة لهذا الدور." if ar else "Follow-up reports are not available for this role.")

    if "list" in kinds:
        total = portfolio.get("total") or 0
        listed = _fmt_items(hits, ar)
        if listed and listed not in ("لا يوجد", "none"):
            parts.append(
                f"ضمن صلاحياتك {total} توصية. منها: {listed}."
                if ar
                else f"You have {total} recommendations in scope, including: {listed}."
            )
        else:
            parts.append(_overview_line(portfolio, ar) if portfolio else "")

    if "overview" in kinds and portfolio:
        parts.append(_overview_line(portfolio, ar))

    if "unclear" in kinds and not parts:
        parts.append(
            "لم أفهم السؤال. " + _capabilities(True)
            if ar
            else "I did not understand that question. " + _capabilities(False)
        )

    if not parts:
        parts.append(
            "لم أفهم السؤال. " + _capabilities(True)
            if ar
            else "I did not understand that question. " + _capabilities(False)
        )

    return _with_advisory("\n".join(p for p in parts if p), ar)


def _should_use_llm(candidate: str, tool_results: dict, name_q: str, kinds: set) -> bool:
    if not (candidate or "").strip():
        return False
    allowed = _collect_allowed_ids(tool_results)
    if any(int(token) not in allowed for token in REC_ID.findall(candidate)):
        return False
    hits = _search_matches(tool_results)
    refs = [item.get("reference") for item in hits if item.get("reference")]
    asked_search = "search" in kinds or bool(name_q)
    if asked_search and refs and not any(ref in candidate for ref in refs):
        return False
    talks_about_name = bool(
        re.search(r"بهذا الاسم|بالاسم أو النص|with this name|matches the name", candidate, re.I)
    )
    if talks_about_name and not name_q:
        return False
    if GENERIC_DUMP.search(candidate) and not (kinds & {"overview", "list"}):
        return False
    return True


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


def run_assistant(user, message: str, language: str = "ar", conversation_id: int | None = None, context: dict | None = None) -> dict:
    lang = language_of(language)
    ar = lang != "en"
    if conversation_id:
        convo = AIConversation.objects.filter(
            pk=conversation_id, user=user, municipality=user.municipality
        ).first()
        if convo is None:
            convo = get_or_create_conversation(user)
    else:
        convo = get_or_create_conversation(user)

    # 1. Scoped bounded memory
    prior = list(convo.messages.order_by("-created_at")[:10])
    prior.reverse()
    history_prior = []
    for m in prior:
        history_prior.append({
            "role": m.role,
            "content": m.content[:800],
            "metadata": m.metadata
        })

    # Repetition handling:
    is_repetition = False
    last_user_msg = None
    last_assistant_msg = None
    for m in reversed(history_prior):
        if m["role"] == "user" and not last_user_msg:
            last_user_msg = m["content"]
        elif m["role"] == "assistant" and not last_assistant_msg:
            last_assistant_msg = m["content"]

    if last_user_msg and (message.strip() == last_user_msg.strip() or "نفس المعلومات" in message or "same info" in message.lower()):
        is_repetition = True

    if is_repetition and last_assistant_msg:
        rep_answer = (
            "لقد عرضت هذه المعلومات للتو. هل هناك تفاصيل محددة ترغب في استكشافها، أم تود إجراء بحث آخر؟"
            if ar else
            "I have already displayed this information. Is there a specific detail you want to explore, or would you like to perform a different query?"
        )
        meta = provider_meta()
        AIMessage.objects.create(
            conversation=convo,
            role=AIMessage.Role.USER,
            content=message[:4000]
        )
        AIMessage.objects.create(
            conversation=convo,
            role=AIMessage.Role.ASSISTANT,
            content=rep_answer,
            metadata={
                "tools": [],
                "provider": meta["provider"],
                "model": meta["model"],
                "intent": ["repetition"],
            }
        )
        convo.save(update_fields=["updated_at"])
        history = [
            {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat(), "metadata": m.metadata}
            for m in convo.messages.order_by("created_at")[:40]
        ]
        return {
            "conversation_id": convo.id,
            "answer": rep_answer,
            "tools": [],
            "tool_results": {},
            "provider": meta["provider"],
            "model": meta["model"],
            "intent": ["repetition"],
            "advisory": True,
            "messages": history,
        }

    # Save user message
    AIMessage.objects.create(conversation=convo, role=AIMessage.Role.USER, content=message[:4000])

    # Intent routing and contextual resolution
    parsed = _parse_query(message)

    if context:
        if context.get("recommendation_id") and not parsed.get("rec_ids") and any(x in message for x in ("لخص", "هذه", "this", "summary", "summarize", "it", "them")):
            parsed["rec_ids"] = [int(context["recommendation_id"])]
            parsed["kinds"].add("rec")
            parsed["kinds"].discard("unclear")
        if context.get("department_id") and not parsed.get("department"):
            from apps.organizations.models import Department
            d = Department.objects.filter(pk=context["department_id"]).first()
            if d:
                parsed["department"] = d.name

    # Greetings and help handling separately
    if "greeting" in parsed["kinds"] or "help" in parsed["kinds"]:
        if "greeting" in parsed["kinds"]:
            answer = (
                "أهلًا بك! أنا مساعد التدقيق الذكي. يمكنني مساعدتك في استعراض التوصيات والتقارير والمهام ومستويات الخطورة. كيف يمكنني مساعدتك اليوم؟"
                if ar else
                "Hello! I am your audit intelligence assistant. I can help you review recommendations, reports, tasks, and risk levels. How can I help you today?"
            )
        else:
            answer = (
                "يمكنني مساعدتك في: البحث عن التوصيات والتقارير، معرفة التوصيات المتأخرة وسبب التأخير، استعراض المواعيد النهائية، تحليل أدلة الإغلاق، ومتابعة الموافقات المطلوبة."
                if ar else
                "I can assist you with: searching recommendations and reports, listing overdue items and their causes, tracking upcoming deadlines, analyzing closure evidence, and reviewing council approvals."
            )
        meta = provider_meta()
        AIMessage.objects.create(
            conversation=convo,
            role=AIMessage.Role.ASSISTANT,
            content=answer,
            metadata={
                "tools": [],
                "provider": meta["provider"],
                "model": meta["model"],
                "intent": list(parsed["kinds"]),
            }
        )
        convo.save(update_fields=["updated_at"])
        history = [
            {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat(), "metadata": m.metadata}
            for m in convo.messages.order_by("created_at")[:40]
        ]
        return {
            "conversation_id": convo.id,
            "answer": answer,
            "tools": [],
            "tool_results": {},
            "provider": meta["provider"],
            "model": meta["model"],
            "intent": list(parsed["kinds"]),
            "advisory": True,
            "messages": history,
        }

    follow_ids = _followup_rec_ids(message, history_prior)
    if follow_ids and not parsed["rec_ids"]:
        parsed["rec_ids"] = follow_ids
        parsed["kinds"].add("rec")
        parsed["kinds"].discard("unclear")

    # Scoped entity retrieval
    calls = _route_tools(parsed, message)
    tool_results = {}
    for name, args in calls:
        fn = TOOLS.get(name)
        if not fn:
            continue
        try:
            tool_results[name] = fn(user, args)
        except Exception:
            tool_results[name] = {"error": "tool_failed"}

    local = _local_answer(message, tool_results, lang, parsed)

    # Render structured prompt
    prompt = render_prompt(
        "assistant_v1.txt",
        language="Modern Standard Arabic" if ar else "English",
        intent=",".join(sorted(parsed["kinds"])) or "unclear",
        conversation_json=json.dumps(history_prior, ensure_ascii=False)[:4000] or "[]",
        trusted_json=json.dumps(tool_results, ensure_ascii=False)[:12000],
        user_message=scrub_text(message, 1500),
    )
    llm_out = generate_structured(
        prompt,
        fallback={"answer": local, "used_tools": list(tool_results.keys())},
    )

    answer = local
    name_q = parsed.get("name_query") or ""
    if isinstance(llm_out.get("answer"), str) and llm_out["answer"].strip():
        candidate = llm_out["answer"].strip()
        if _should_use_llm(candidate, tool_results, name_q, parsed["kinds"]):
            answer = _with_advisory(candidate[:4000], ar)

    meta = provider_meta()
    AIMessage.objects.create(
        conversation=convo,
        role=AIMessage.Role.ASSISTANT,
        content=answer,
        metadata={
            "tools": list(tool_results.keys()),
            "provider": meta["provider"],
            "model": meta["model"],
            "intent": sorted(parsed["kinds"]),
        },
    )
    convo.save(update_fields=["updated_at"])
    history = [
        {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat(), "metadata": m.metadata}
        for m in convo.messages.order_by("created_at")[:40]
    ]
    return {
        "conversation_id": convo.id,
        "answer": answer,
        "tools": list(tool_results.keys()),
        "tool_results": tool_results,
        "provider": meta["provider"],
        "model": meta["model"],
        "intent": sorted(parsed["kinds"]),
        "advisory": True,
        "messages": history,
    }
