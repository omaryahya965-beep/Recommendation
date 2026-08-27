from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any, Callable

from django.conf import settings
from django.utils import timezone

from apps.ai.exceptions import AIUnavailable, AIValidationError
from apps.ai.models import AIAnalysis, AIJob
from apps.ai.providers import get_llm_provider, provider_meta

logger = logging.getLogger("apps.ai")

JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def require_ai_enabled():
    if not settings.AI_ENABLED:
        raise AIUnavailable("AI unavailable")


def language_of(value: str | None) -> str:
    if (value or "").lower().startswith("en"):
        return "en"
    return "ar"


def content_hash(*parts: Any) -> str:
    digest = hashlib.sha256()
    for part in parts:
        if isinstance(part, (dict, list)):
            payload = json.dumps(part, ensure_ascii=False, sort_keys=True)
        else:
            payload = "" if part is None else str(part)
        digest.update(payload.encode("utf-8"))
        digest.update(b"\x1e")
    return digest.hexdigest()


def clamp_score(value, default=50) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = default
    return max(0, min(100, number))


def parse_json_object(raw: str) -> dict:
    if not raw or not str(raw).strip():
        raise AIValidationError("Empty AI response.")
    text = str(raw).strip()
    fenced = JSON_FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(text[start : end + 1])
        else:
            raise AIValidationError("AI returned invalid JSON.")
    if not isinstance(data, dict):
        raise AIValidationError("AI returned a non-object JSON payload.")
    return data


def cached_analysis(analysis_type: str, target_type: str, target_id: int, digest: str, model: str):
    return (
        AIAnalysis.objects.filter(
            analysis_type=analysis_type,
            target_type=target_type,
            target_id=target_id,
            content_hash=digest,
            model=model,
        )
        .order_by("-created_at")
        .first()
    )


def store_analysis(
    *,
    analysis_type: str,
    target_type: str,
    target_id: int,
    municipality,
    digest: str,
    output: dict,
    confidence,
    user,
) -> AIAnalysis:
    meta = provider_meta()
    return AIAnalysis.objects.create(
        analysis_type=analysis_type,
        target_type=target_type,
        target_id=target_id,
        municipality=municipality,
        content_hash=digest,
        provider=meta["provider"],
        model=meta["model"],
        output=output,
        confidence=confidence,
        created_by=user,
    )


def serialize_live(*, analysis_type: str, target_type: str, target_id: int, output: dict) -> dict:
    """Unpersisted heuristic output so advisory panels are never blank."""
    return {
        "id": None,
        "analysis_type": analysis_type,
        "target_type": target_type,
        "target_id": target_id,
        "provider": "local",
        "model": "heuristic-v1",
        "output": output,
        "confidence": output.get("confidence"),
        "human_reviewed": False,
        "created_at": timezone.now().isoformat(),
        "advisory": True,
        "human_decision_required": True,
        "live": True,
    }


def serialize_analysis(analysis: AIAnalysis) -> dict:
    return {
        "id": analysis.id,
        "analysis_type": analysis.analysis_type,
        "target_type": analysis.target_type,
        "target_id": analysis.target_id,
        "provider": analysis.provider,
        "model": analysis.model,
        "output": analysis.output,
        "confidence": analysis.confidence,
        "human_reviewed": analysis.human_reviewed,
        "created_at": analysis.created_at.isoformat(),
        "advisory": True,
        "human_decision_required": True,
    }


def latest_analysis(analysis_type: str, target_type: str, target_id: int):
    return (
        AIAnalysis.objects.filter(
            analysis_type=analysis_type,
            target_type=target_type,
            target_id=target_id,
        )
        .order_by("-created_at")
        .first()
    )


def run_job(*, user, job_type: str, target_type: str, target_id: int | None, fn: Callable[[], AIAnalysis | None]):
    require_ai_enabled()
    from datetime import timedelta

    # 1. Concurrency deduplication: look for a running/pending job
    existing_job = AIJob.objects.filter(
        created_by=user,
        job_type=job_type,
        target_type=target_type or "",
        target_id=target_id,
        status__in=[AIJob.Status.PENDING, AIJob.Status.RUNNING],
        created_at__gte=timezone.now() - timedelta(seconds=30)
    ).first()

    if existing_job:
        for _ in range(30):
            time.sleep(1)
            try:
                existing_job.refresh_from_db()
            except Exception:
                break
            if existing_job.status == AIJob.Status.COMPLETED:
                return existing_job
            if existing_job.status == AIJob.Status.FAILED:
                break

    job = AIJob.objects.create(
        status=AIJob.Status.PENDING,
        job_type=job_type,
        target_type=target_type or "",
        target_id=target_id,
        created_by=user,
    )
    job.status = AIJob.Status.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])
    started = time.perf_counter()
    try:
        analysis = fn()
        job.status = AIJob.Status.COMPLETED
        job.analysis = analysis
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "analysis", "completed_at"])
        logger.info(
            "ai_job_ok type=%s target=%s:%s provider=%s latency_ms=%s",
            job_type,
            target_type,
            target_id,
            provider_meta()["provider"],
            int((time.perf_counter() - started) * 1000),
        )
        return job
    except Exception as exc:
        job.status = AIJob.Status.FAILED
        job.error = str(exc)[:2000]
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        logger.warning(
            "ai_job_fail type=%s target=%s:%s err=%s",
            job_type,
            target_type,
            target_id,
            type(exc).__name__,
        )
        raise


def generate_structured(prompt: str, fallback: dict, *, system: str | None = None, context=None) -> dict:
    """Call the configured LLM. On any failure or invalid JSON, retry once, then use fallback."""
    llm = get_llm_provider()
    usage_holder = {}

    def _sink(usage):
        usage_holder.update(usage or {})

    def _once():
        raw = llm.generate(
            prompt,
            context=context,
            system=system,
            fallback=fallback,
            usage_sink=_sink,
        )
        parsed = parse_json_object(raw)
        if usage_holder:
            logger.info(
                "ai_usage provider=%s model=%s prompt_tokens=%s completion_tokens=%s",
                llm.name,
                getattr(llm, "model", ""),
                usage_holder.get("prompt_tokens"),
                usage_holder.get("completion_tokens"),
            )
        return parsed

    try:
        return _once()
    except Exception as first:
        logger.warning("ai_generate_retry reason=%s", type(first).__name__)
        try:
            repair = (
                prompt
                + "\n\nREPAIR: Your previous output was invalid JSON. "
                "Return a single valid JSON object matching the schema. No markdown."
            )
            llm = get_llm_provider()
            raw = llm.generate(repair, context=context, system=system, fallback=fallback)
            return parse_json_object(raw)
        except Exception:
            if llm.name != "local":
                logger.warning("ai_generate_fallback_local")
            return fallback


def serialize_job(job: AIJob) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "job_type": job.job_type,
        "target_type": job.target_type,
        "target_id": job.target_id,
        "error": job.error,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "analysis": serialize_analysis(job.analysis) if job.analysis_id else None,
    }
