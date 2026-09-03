"""Live OpenAI smoke for the assistant tool loop. Prints a transcript; never logs the API key."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import django

django.setup()

from apps.accounts.models import User
from apps.ai.providers.llm import OpenAILLMProvider
from apps.ai.services.audit_assistant import clear_conversation, run_assistant
from apps.audits.models import Recommendation

orig_chat = OpenAILLMProvider.chat
rounds: list[dict] = []


def wrapped(self, messages, tools=None, **kwargs):
    result = orig_chat(self, messages, tools=tools, **kwargs)
    rounds.append(
        {
            "finish_reason": result.get("finish_reason"),
            "tool_calls": result.get("tool_calls"),
            "content": result.get("content"),
            "usage": result.get("usage"),
        }
    )
    return result


OpenAILLMProvider.chat = wrapped


def main() -> int:
    from django.conf import settings

    print(
        json.dumps(
            {
                "provider": settings.AI_PROVIDER,
                "model": settings.AI_MODEL,
                "key_configured": bool((settings.AI_API_KEY or "").strip()),
                "key_prefix": (settings.AI_API_KEY or "")[:3],
                "key_len": len(settings.AI_API_KEY or ""),
            }
        )
    )
    user = User.objects.filter(role="audit", is_active=True).order_by("id").first()
    if user is None:
        print("NO_AUDIT_USER")
        return 2
    rec = Recommendation.objects.filter(pk=15, report__municipality=user.municipality).first()
    if rec is None:
        rec = (
            Recommendation.objects.filter(report__municipality=user.municipality)
            .order_by("id")
            .first()
        )
    if rec is None:
        print("NO_RECOMMENDATION")
        return 3
    message = f"What is recommendation {rec.id}?"
    clear_conversation(user)
    try:
        result = run_assistant(user, message, "en")
    except Exception as exc:
        err_path = Path(__file__).resolve().parent.parent / ".ai_live_smoke.json"
        err_path.write_text(
            json.dumps(
                {
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:400],
                    "llm_rounds": rounds,
                },
                ensure_ascii=False,
                default=str,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"WROTE_ERROR {err_path}")
        return 1
    payload = {
        "user_id": user.id,
        "username": user.username,
        "user_message": message,
        "recommendation_id": rec.id,
        "llm_rounds": rounds,
        "tools": result["tools"],
        "tool_results": result["tool_results"],
        "answer": result["answer"],
        "provider": result["provider"],
        "model": result["model"],
    }
    out_path = Path(__file__).resolve().parent.parent / ".ai_live_smoke.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
    print(f"WROTE {out_path} bytes={out_path.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
