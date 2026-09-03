"""Internal audit assistant with server-side tools only. No raw SQL. RBAC on every tool."""
from __future__ import annotations

import json
import re
import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from apps.ai.exceptions import AIUnavailable
from apps.ai.models import AIConversation, AIMessage
from apps.ai.providers import get_chat_llm
from apps.ai.providers.llm import USER_SAFE_UNAVAILABLE
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.risk_engine import delay_risk_score_only
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text
from apps.ai.services.common import language_of
from apps.audits.finding import case_title
from apps.audits.models import AuditReport, Recommendation
from apps.audits.serializers import is_overdue
from apps.core.permissions import scope_recommendations, scope_reports
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

ADVISORY_AR = "هذه إجابة استشارية ولا تغيّر حالة سير العمل."
ADVISORY_EN = "This is advisory and does not change workflow status."
TOOL_RESULT_CHAR_CAP = 24000
HISTORY_MESSAGE_CAP = 24


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
    plan = getattr(rec, "action_plan", None)
    emp = getattr(plan, "responsible_employee", None) if plan else None
    facts["title"] = _display_title(rec.text)
    facts["text"] = scrub_text(rec.text, 4000)
    facts["root_cause"] = scrub_text(rec.root_cause, 2000)
    facts["overdue"] = is_overdue(rec)
    facts["report_status"] = rec.report.status
    facts["evidence_count"] = rec.evidence_files.count()
    if emp:
        facts["responsible_employee"] = emp.full_name_ar or emp.get_full_name() or emp.username
    else:
        facts["responsible_employee"] = None
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


def tool_get_report(user, report_id: int):
    report = (
        scope_reports(AuditReport.objects.select_related("department"), user)
        .filter(pk=report_id)
        .first()
    )
    if report is None:
        return {"error": "not_found_or_unauthorized"}
    rec_ids = list(_qs(user).filter(report=report).values_list("id", flat=True)[:50])
    return {
        "id": report.id,
        "title": report.title,
        "status": report.status,
        "engagement_type": report.engagement_type,
        "department": report.department.name,
        "response_deadline": str(report.response_deadline) if report.response_deadline else None,
        "recommendation_ids": rec_ids,
        "recommendation_count": len(rec_ids),
    }


def tool_search_reports(user, query: str = ""):
    qs = scope_reports(AuditReport.objects.select_related("department"), user)
    term = (query or "").strip()[:80]
    if term:
        qs = qs.filter(Q(title__icontains=term) | Q(department__name__icontains=term))
    matches = [
        {
            "id": r.id,
            "title": r.title,
            "status": r.status,
            "department": r.department.name,
            "engagement_type": r.engagement_type,
        }
        for r in qs[:15]
    ]
    return {"query": term, "count": len(matches), "matches": matches}


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
    "get_report": lambda user, args: tool_get_report(user, int(args.get("id") or 0)),
    "search_reports": lambda user, args: tool_search_reports(user, args.get("query") or ""),
}


def _fn_schema(name: str, description: str, properties: dict | None = None, required: list | None = None):
    params = {"type": "object", "properties": properties or {}, "additionalProperties": False}
    if required:
        params["required"] = required
    return {"type": "function", "function": {"name": name, "description": description, "parameters": params}}


REC_ID_PROP = {"id": {"type": "integer", "description": "Numeric recommendation id (not the REC- prefix)."}}

TOOL_SCHEMAS = [
    _fn_schema("get_portfolio", "Scoped counts and sample lists: overdue, high-risk, verification, recurring, departments."),
    _fn_schema("get_recommendation", "Full facts for one recommendation the user is allowed to see.", REC_ID_PROP, ["id"]),
    _fn_schema(
        "search_recommendations",
        "Search recommendations in the user's scope by text, department name, or status.",
        {
            "query": {"type": "string"},
            "department": {"type": "string"},
            "status": {"type": "string"},
        },
    ),
    _fn_schema(
        "get_department_statistics",
        "Counts for a department in the user's scope.",
        {"department": {"type": "string"}},
    ),
    _fn_schema("get_overdue_recommendations", "List overdue recommendations in scope."),
    _fn_schema("get_recurring_findings", "List recurring findings in scope."),
    _fn_schema("get_action_plan_status", "Action plan and steps for one recommendation.", REC_ID_PROP, ["id"]),
    _fn_schema("get_evidence_status", "Evidence and latest verification for one recommendation.", REC_ID_PROP, ["id"]),
    _fn_schema("get_audit_history", "Recent audit trail actions for one recommendation.", REC_ID_PROP, ["id"]),
    _fn_schema("get_followup_reports", "Recent municipality follow-up reports. Employees are not authorized."),
    _fn_schema("get_approaching_deadlines", "Recommendations with target dates in the next 14 days."),
    _fn_schema("get_insufficient_verification", "Recommendations previously returned as insufficient evidence."),
    _fn_schema("why_high_risk", "Recorded risk plus delay-risk factors for one recommendation.", REC_ID_PROP, ["id"]),
    _fn_schema("get_report", "Audit report facts in the user's report scope.", {"id": {"type": "integer"}}, ["id"]),
    _fn_schema("search_reports", "Search audit reports in the user's scope.", {"query": {"type": "string"}}),
]


def execute_tool(user, name: str, args: dict):
    fn = TOOLS.get(name)
    if not fn:
        return {"error": "invalid_tool_or_args", "name": name}
    try:
        if not isinstance(args, dict):
            args = {}
        return fn(user, args)
    except (TypeError, ValueError, KeyError):
        return {"error": "invalid_tool_or_args", "name": name}
    except Exception:
        logger.warning("ai_tool_failed name=%s", name)
        return {"error": "tool_failed", "name": name}


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


def _page_context_note(context: dict | None) -> str:
    if not context:
        return ""
    bits = []
    rec_id = context.get("recommendation_id")
    report_id = context.get("report_id")
    dept_id = context.get("department_id")
    route = context.get("route")
    if rec_id:
        bits.append(f"The UI is viewing recommendation id {int(rec_id)}.")
    if report_id:
        bits.append(f"The UI is viewing report id {int(report_id)}.")
    if dept_id:
        bits.append(f"The UI is viewing department id {int(dept_id)}.")
    if route:
        bits.append(f"Current route: {str(route)[:120]}.")
    return " ".join(bits)


def _history_payload(convo) -> list[dict]:
    return [
        {
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
            "metadata": m.metadata,
        }
        for m in convo.messages.order_by("created_at")[:40]
    ]


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

    memory_msg = convo.messages.filter(role=AIMessage.Role.SYSTEM).first()
    if not memory_msg:
        AIMessage.objects.create(
            conversation=convo,
            role=AIMessage.Role.SYSTEM,
            content="Persistent conversation memory",
            metadata={"current_language": lang},
        )

    AIMessage.objects.create(conversation=convo, role=AIMessage.Role.USER, content=message[:4000])

    system = render_prompt(
        "assistant_v1.txt",
        language="Modern Standard Arabic" if ar else "English",
        role=user.role,
        page_context=_page_context_note(context) or "None.",
    )
    prior = list(
        convo.messages.exclude(role=AIMessage.Role.SYSTEM).order_by("-created_at")[:HISTORY_MESSAGE_CAP]
    )
    prior.reverse()
    messages = [{"role": "system", "content": system}]
    for item in prior:
        if item.role in (AIMessage.Role.USER, AIMessage.Role.ASSISTANT):
            messages.append({"role": item.role, "content": (item.content or "")[:4000]})

    used_tools: list[str] = []
    tool_results: dict = {}
    max_iter = int(getattr(settings, "AI_MAX_TOOL_ITERATIONS", 6) or 6)
    answer = ""
    chat_llm = get_chat_llm()

    try:
        for _ in range(max_iter):
            result = chat_llm.chat(messages, tools=TOOL_SCHEMAS)
            tool_calls = result.get("tool_calls") or []
            if tool_calls:
                messages.append(
                    {
                        "role": "assistant",
                        "content": result.get("content") or "",
                        "tool_calls": tool_calls,
                    }
                )
                for call in tool_calls:
                    fn = call.get("function") or {}
                    name = fn.get("name") or ""
                    raw_args = fn.get("arguments") or "{}"
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                    except json.JSONDecodeError:
                        args = {}
                    if not isinstance(args, dict):
                        args = {}
                    payload = execute_tool(user, name, args)
                    used_tools.append(name)
                    tool_results[name] = payload
                    dumped = json.dumps(payload, ensure_ascii=False, default=str)
                    if len(dumped) > TOOL_RESULT_CHAR_CAP:
                        dumped = dumped[:TOOL_RESULT_CHAR_CAP] + "...[truncated]"
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.get("id") or "call",
                            "content": dumped,
                        }
                    )
                continue
            answer = (result.get("content") or "").strip()
            break
        else:
            logger.error("ai_assistant_tool_loop_exhausted")
            raise AIUnavailable(USER_SAFE_UNAVAILABLE)
        if not answer:
            logger.error("ai_assistant_empty_answer")
            raise AIUnavailable(USER_SAFE_UNAVAILABLE)
    except AIUnavailable:
        raise
    except Exception:
        logger.exception("ai_assistant_chat_failed")
        raise AIUnavailable(USER_SAFE_UNAVAILABLE)

    advisory = ADVISORY_AR if ar else ADVISORY_EN
    if advisory not in answer:
        answer = f"{answer}\n\n{advisory}"

    AIMessage.objects.create(
        conversation=convo,
        role=AIMessage.Role.ASSISTANT,
        content=answer[:8000],
        metadata={
            "tools": used_tools,
            "provider": chat_llm.name,
            "model": chat_llm.model,
        },
    )
    convo.save(update_fields=["updated_at"])
    return {
        "conversation_id": convo.id,
        "answer": answer,
        "tools": used_tools,
        "tool_results": tool_results,
        "provider": chat_llm.name,
        "model": chat_llm.model,
        "intent": used_tools or ["chat"],
        "advisory": True,
        "messages": _history_payload(convo),
    }
