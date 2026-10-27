"""Audit assistant runner: the conversation, the model loop and the
advisory framing. Tools live in tools.py."""
from __future__ import annotations

import json
import re
import logging

from django.conf import settings

from apps.ai.exceptions import AIUnavailable
from apps.ai.models import AIConversation, AIMessage
from apps.ai.providers import get_chat_llm
from apps.ai.providers.llm import USER_SAFE_UNAVAILABLE
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.common import language_of

from .tools import (
    ADVISORY_AR,
    ADVISORY_EN,
    HISTORY_MESSAGE_CAP,
    TOOL_RESULT_CHAR_CAP,
    TOOL_SCHEMAS,
    execute_tool,
)

logger = logging.getLogger("apps.ai")


# Case references in any written form: REC-0016, REC-16, rec 16.
_CASE_REF = re.compile(r"(?<![A-Za-z])REC[-\s]?0*(\d+)\b", re.IGNORECASE)
UNVERIFIED_NOTE = {"ar": "(غير متحقق منها في بيانات المنظومة)", "en": "(not verified in the system's data)"}


def _verified_case_ids(tool_results, earlier_answers) -> set[int]:
    """Cases the answer may name: those in this turn's tool results, and
    those named (and not flagged) in earlier answers of the conversation."""
    ids = {int(n) for n in _CASE_REF.findall(json.dumps(tool_results, ensure_ascii=False, default=str))}
    flags = tuple(UNVERIFIED_NOTE.values())
    for text in earlier_answers:
        for match in _CASE_REF.finditer(text or ""):
            if not text[match.end():].lstrip().startswith(flags):
                ids.add(int(match.group(1)))
    return ids


def flag_unverified_references(answer: str, verified: set[int], lang: str) -> str:
    """Marks every case reference the tools did not return, so an invented or
    out-of-scope case is never presented as fact (external QA)."""
    note = UNVERIFIED_NOTE["en" if lang == "en" else "ar"]
    flagged = []

    def mark(match):
        if int(match.group(1)) in verified or answer[match.end():].lstrip().startswith(note):
            return match.group(0)
        flagged.append(match.group(0))
        return f"{match.group(0)} {note}"

    result = _CASE_REF.sub(mark, answer)
    if flagged:
        logger.warning("ai_assistant_unverified_references refs=%s", ",".join(flagged))
    return result


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

    earlier = [item.content for item in prior if item.role == AIMessage.Role.ASSISTANT]
    answer = flag_unverified_references(answer, _verified_case_ids(tool_results, earlier), lang)

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
