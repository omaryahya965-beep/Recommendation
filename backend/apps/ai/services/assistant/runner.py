"""Audit assistant runner: the conversation, the model loop and the
advisory framing. Tools live in tools.py."""
from __future__ import annotations

import json
import logging

from django.conf import settings

from apps.ai.exceptions import AIUnavailable
from apps.ai.models import AIConversation, AIMessage
from apps.ai.providers import get_chat_llm
from apps.ai.providers.llm import USER_SAFE_UNAVAILABLE
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.common import language_of

from .validation import correction_message, safe_answer, validate_answer
from .tools import (
    ADVISORY_AR,
    ADVISORY_EN,
    HISTORY_MESSAGE_CAP,
    TOOL_RESULT_CHAR_CAP,
    TOOL_SCHEMAS,
    execute_tool,
)

logger = logging.getLogger("apps.ai")


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



def _converse(chat_llm, messages, user, used_tools, tool_results) -> str:
    """Run the model, executing tool calls, until it answers in text."""
    max_iter = int(getattr(settings, "AI_MAX_TOOL_ITERATIONS", 6) or 6)
    for _ in range(max_iter):
        result = chat_llm.chat(messages, tools=TOOL_SCHEMAS)
        tool_calls = result.get("tool_calls") or []
        if not tool_calls:
            answer = (result.get("content") or "").strip()
            if not answer:
                logger.error("ai_assistant_empty_answer")
                raise AIUnavailable(USER_SAFE_UNAVAILABLE)
            return answer
        messages.append({"role": "assistant", "content": result.get("content") or "", "tool_calls": tool_calls})
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
            messages.append({"role": "tool", "tool_call_id": call.get("id") or "call", "content": dumped})
    logger.error("ai_assistant_tool_loop_exhausted")
    raise AIUnavailable(USER_SAFE_UNAVAILABLE)

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
    chat_llm = get_chat_llm()

    try:
        answer = _converse(chat_llm, messages, user, used_tools, tool_results)
        # Round 2, 2.4: check the answer against the database. One retry with
        # the problems and the correct facts; if it still fails, answer only
        # from the records instead of showing an unverified text.
        problems, facts = validate_answer(user, answer)
        validation = "passed"
        if problems:
            logger.warning("ai_assistant_answer_rejected problems=%s", [(p.kind, p.ref) for p in problems])
            messages.append({"role": "assistant", "content": answer})
            messages.append({"role": "user", "content": correction_message(problems, facts, lang)})
            retry = _converse(chat_llm, messages, user, used_tools, tool_results)
            retry_problems, retry_facts = validate_answer(user, retry)
            if retry_problems:
                logger.warning("ai_assistant_retry_rejected problems=%s", [(p.kind, p.ref) for p in retry_problems])
                answer = safe_answer({**facts, **retry_facts}, lang)
                validation = "fallback"
            else:
                answer = retry
                validation = "retried"
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
            "validation": validation,
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
        "validation": validation,
        "messages": _history_payload(convo),
    }
