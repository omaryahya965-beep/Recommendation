"""Delay / problem risk estimates from live system data. Never presented as facts."""
from __future__ import annotations

import json

from django.utils import timezone

from apps.ai.models import AIAnalysis
from apps.ai.providers import provider_meta
from apps.ai.services.case_copy import next_action, risk_label, status_label
from apps.ai.services.common import (
    cached_analysis,
    clamp_score,
    content_hash,
    generate_structured,
    language_of,
    prefer_prose,
    store_analysis,
    text_matches_language,
)
from apps.ai.services.prompt_manager import render_prompt
from apps.audits.finding import case_title
from apps.audits.models import Recommendation
from apps.audits.serializers import is_overdue
from apps.workflow.models import VerificationDecision

ANALYSIS_VERSION = "risk_v3"

ACTIVE = (
    Recommendation.Status.IN_PROGRESS,
    Recommendation.Status.RETURNED_INSUFFICIENT,
    Recommendation.Status.PARTIAL,
    Recommendation.Status.REOPENED,
    Recommendation.Status.PENDING_HEAD_REVIEW,
    Recommendation.Status.SUBMITTED_FOR_VERIFICATION,
    Recommendation.Status.CLOSURE_REVIEW,
    Recommendation.Status.PENDING_CLOSURE_COUNCIL,
)


def collect_risk_inputs(rec) -> dict:
    today = timezone.localdate()
    plan = getattr(rec, "action_plan", None)
    steps = list(plan.steps.all()) if plan else []
    total_steps = len(steps)
    done_steps = sum(1 for s in steps if s.is_done)
    avg_progress = round(sum(s.progress_percent for s in steps) / total_steps, 1) if total_steps else 0.0
    remaining_days = None
    elapsed_ratio = None
    if plan and plan.target_date:
        remaining_days = (plan.target_date - today).days
        created = plan.created_at.date() if plan.created_at else rec.created_at.date()
        span = max(1, (plan.target_date - created).days)
        elapsed_ratio = max(0.0, min(1.0, (today - created).days / span))

    evidence_count = len(rec.evidence_files.all())
    response = getattr(rec, "response", None)
    verifications = list(rec.verifications.all())
    fail_count = sum(
        1 for v in verifications
        if v.decision in (VerificationDecision.Decision.INSUFFICIENT, VerificationDecision.Decision.PARTIAL)
    )
    trail_entries = list(rec.trail_entries.all())
    trail = max(trail_entries, key=lambda entry: entry.created_at) if trail_entries else None
    last_activity = None
    idle_days = None
    if trail:
        last_activity = trail.created_at.date()
        idle_days = (today - last_activity).days
    elif rec.updated_at:
        last_activity = rec.updated_at.date()
        idle_days = (today - last_activity).days

    plan_revisions = plan.revision_count if plan else 0
    response_revisions = response.revision_count if response else 0

    return {
        "reference": f"REC-{rec.id}",
        "title": case_title(rec.text),
        "department": rec.report.department.name,
        "status": rec.status,
        "risk_level": rec.risk_level,
        "overdue": is_overdue(rec),
        "target_date": str(plan.target_date) if plan and plan.target_date else None,
        "remaining_days": remaining_days,
        "elapsed_ratio": elapsed_ratio,
        "progress_percent": avg_progress,
        "completed_steps": done_steps,
        "incomplete_steps": max(0, total_steps - done_steps),
        "total_steps": total_steps,
        "evidence_count": evidence_count,
        "has_management_response": bool(response),
        "action_plan_status": plan.status if plan else None,
        "plan_revision_count": plan_revisions,
        "response_revision_count": response_revisions,
        "verification_failure_count": fail_count,
        "idle_days": idle_days,
        "last_activity": str(last_activity) if last_activity else None,
        "is_recurring_confirmed": rec.is_recurring and rec.recurrence_confirmed,
        "has_action_plan": bool(plan),
    }


def _situation_lines(data: dict, language: str) -> list[str]:
    ar = language != "en"
    lines = []
    title = data.get("title") or data.get("reference")
    dept = data.get("department") or "—"
    status = status_label(data.get("status") or "", language)
    risk = risk_label(data.get("risk_level") or "", language)
    if ar:
        lines.append(f"{data.get('reference')} — {title}. الدائرة: {dept}. الحالة: {status}. الخطورة: {risk}.")
    else:
        lines.append(f"{data.get('reference')} — {title}. Department: {dept}. Status: {status}. Risk: {risk}.")
    if data.get("target_date"):
        remaining = data.get("remaining_days")
        progress = int(data.get("progress_percent") or 0)
        done = data.get("completed_steps") or 0
        total = data.get("total_steps") or 0
        if ar:
            remain_txt = (
                f"متأخرة بـ {abs(remaining)} يوماً" if remaining is not None and remaining < 0
                else f"متبقٍ {remaining} يوماً" if remaining is not None
                else "الموعد غير محسوب"
            )
            lines.append(
                f"الموعد المستهدف {data['target_date']} ({remain_txt}). "
                f"تقدم الخطوات: {progress}% ({done} من {total}). الأدلة المرفوعة: {data.get('evidence_count') or 0}."
            )
        else:
            remain_txt = (
                f"{abs(remaining)} days overdue" if remaining is not None and remaining < 0
                else f"{remaining} days remaining" if remaining is not None
                else "remaining days unknown"
            )
            lines.append(
                f"Target date {data['target_date']} ({remain_txt}). "
                f"Step progress: {progress}% ({done} of {total}). Evidence files: {data.get('evidence_count') or 0}."
            )
    idle = data.get("idle_days")
    if idle is not None:
        lines.append(
            f"آخر نشاط مسجّل منذ {idle} يوماً." if ar else f"Last recorded activity was {idle} days ago."
        )
    return lines


def _narrative_from(data: dict, score: int, estimable: bool, language: str) -> str:
    ar = language != "en"
    nxt = next_action(data.get("status") or "", language)
    if not estimable:
        if ar:
            return (
                f"لا يُقدَّر التأخير بعد لـ {data.get('reference')} — لا خطة بموعد. "
                f"الحالة: «{status_label(data.get('status') or '', language)}». {nxt}"
            )
        return (
            f"Delay cannot be estimated yet for {data.get('reference')}: no plan with a target date. "
            f"Status: «{status_label(data.get('status') or '', language)}». {nxt}"
        )
    remaining = data.get("remaining_days")
    progress = int(data.get("progress_percent") or 0)
    if ar:
        remain = (
            f"تجاوزت الموعد بـ {abs(remaining)} يوماً" if remaining is not None and remaining < 0
            else f"يتبقى {remaining} يوماً" if remaining is not None
            else "الموعد غير محدد"
        )
        return (
            f"تقدير التأخير لـ {data.get('reference')}: {score}%. "
            f"{remain}، والتقدم {progress}%. {nxt}"
        )
    remain = (
        f"It is {abs(remaining)} days past the target date" if remaining is not None and remaining < 0
        else f"{remaining} days remain" if remaining is not None
        else "The target date is unset"
    )
    return (
        f"Estimated delay likelihood for {data.get('reference')} is {score}% — not a finding that it will be late. "
        f"{remain}, and implementation progress is {progress}%. {nxt}"
    )


def score_from_inputs(data: dict, language: str) -> dict:
    ar = language != "en"
    estimable = bool(data.get("target_date"))
    score = 12 if estimable else 0
    factors = []
    remaining = data.get("remaining_days")
    progress = data.get("progress_percent") or 0
    elapsed = data.get("elapsed_ratio") or 0
    idle = data.get("idle_days")
    incomplete = data.get("incomplete_steps") or 0
    total = data.get("total_steps") or 0
    evidence = data.get("evidence_count") or 0
    fails = data.get("verification_failure_count") or 0
    plan_rev = data.get("plan_revision_count") or 0
    resp_rev = data.get("response_revision_count") or 0

    if not estimable:
        factors.append(
            f"لا يوجد موعد مستهدف بعد — التوصية في مرحلة «{status_label(data.get('status') or '', language)}»"
            if ar
            else f"No target date yet — the recommendation is still «{status_label(data.get('status') or '', language)}»"
        )
        if not data.get("has_action_plan"):
            factors.append("لم تُعتمد خطة عمل بعد" if ar else "No action plan has been approved yet")
        if not data.get("has_management_response"):
            factors.append("لا يوجد رد إدارة بعد" if ar else "No management response yet")
        attention = next_action(data.get("status") or "", language)
        return {
            "delay_risk_score": 0,
            "risk_level": "UNAVAILABLE",
            "estimable": False,
            "confidence": 38,
        "factors": factors[:4],
        "situation": _situation_lines(data, language)[:2],
        "recommended_attention": attention,
        "narrative": _narrative_from(data, 0, False, language),
            "next_action": attention,
            "inputs": data,
            "missing_data": list(factors),
            "wording": (
                "تقدير الذكاء الاصطناعي لاحتمالية التأخير — وليس حكماً بأن التوصية ستتأخر."
                if ar
                else "AI estimates a likelihood of delay — not a statement that the recommendation will be late."
            ),
            "advisory": True,
        }

    if data.get("overdue"):
        score += 38
        factors.append("التوصية متأخرة عن الموعد المستهدف" if ar else "Past the action-plan target date")
    elif remaining is not None:
        if remaining <= 7:
            score += 24
            factors.append("الموعد المستهدف قريب (7 أيام أو أقل)" if ar else "Deadline is approaching (7 days or fewer)")
        elif remaining <= 21:
            score += 14
            factors.append("الموعد المستهدف خلال ثلاثة أسابيع" if ar else "Deadline is within three weeks")
        elif remaining > 60 and progress < 10:
            score += 10
            factors.append(
                "المدة المتبقية طويلة لكن التقدم لا يزال منخفضاً"
                if ar
                else "Plenty of calendar time remains but progress is still low"
            )

    if total:
        pct_done = (data["completed_steps"] / total) * 100
        if pct_done <= 25 and (elapsed or 0) >= 0.5:
            score += 18
            factors.append(
                f"أُنجز {data['completed_steps']} من {total} خطوات رغم مرور جزء كبير من المدة"
                if ar
                else f"Only {data['completed_steps']} of {total} steps completed while much of the period has elapsed"
            )
        elif pct_done < 50:
            score += 10
            factors.append(
                f"نسبة إنجاز الخطوات {int(progress)}%"
                if ar
                else f"Step progress is {int(progress)}%"
            )
        if incomplete:
            factors.append(
                f"{incomplete} خطوات غير مكتملة" if ar else f"{incomplete} incomplete steps"
            )

    if elapsed and elapsed >= 0.75 and progress < 80:
        score += 10
        factors.append(
            "انقضى نحو 75% من المدة المستهدفة مع تقدم غير مكتمل"
            if ar
            else "About 75% of the target period has elapsed with incomplete progress"
        )

    if evidence == 0 and data.get("status") in [s for s in ACTIVE]:
        score += 12
        factors.append("لم يُرفع دليل تنفيذ بعد" if ar else "No implementation evidence uploaded yet")

    if fails:
        score += min(20, fails * 8)
        factors.append(
            f"حالات تحقق غير كافية/جزئية: {fails}"
            if ar
            else f"Insufficient/partial verification decisions: {fails}"
        )

    if idle is not None and idle >= 10 and data.get("status") not in (
        Recommendation.Status.CLOSED,
        Recommendation.Status.PENDING_COUNCIL,
        Recommendation.Status.DRAFT,
    ):
        score += 10
        factors.append(
            f"لا يوجد نشاط منذ {idle} يوماً" if ar else f"No recorded activity for {idle} days"
        )

    if plan_rev >= 2:
        score += 6
        factors.append(
            f"خطة العمل أُعيدت {plan_rev} مرة" if ar else f"Action plan revised {plan_rev} times"
        )
    if resp_rev >= 2:
        score += 4
        factors.append(
            f"رد الإدارة أُعيد {resp_rev} مرة" if ar else f"Management response revised {resp_rev} times"
        )

    if data.get("risk_level") == "high":
        score += 8
        factors.append("مستوى الخطورة المسجّل: مرتفع" if ar else "Recorded risk level is high")

    if data.get("is_recurring_confirmed"):
        score += 6
        factors.append("تكرار مؤكد بشرياً" if ar else "Human-confirmed recurring finding")

    score = clamp_score(score)
    if score >= 75:
        level = "HIGH"
        attention = "يُوصى بمتابعة عاجلة من التدقيق مع رئيس الدائرة" if ar else "Urgent audit follow-up with the department head is recommended"
    elif score >= 50:
        level = "MEDIUM"
        attention = "يُستحسن مراجعة التقدم الأسبوعي مع الدائرة" if ar else "A weekly progress review with the department is advisable"
    else:
        level = "LOW"
        attention = "المؤشرات الحالية لا تشير إلى ضغط زمني مرتفع" if ar else "Current indicators do not suggest high time pressure"

    if not factors:
        factors.append("لا توجد إشارات تأخير بارزة في البيانات المتاحة" if ar else "No strong delay signals in available data")

    return {
        "delay_risk_score": score,
        "risk_level": level,
        "estimable": True,
        "confidence": 78 if total else 62,
        "factors": factors[:4],
        "situation": _situation_lines(data, language)[:2],
        "recommended_attention": attention,
        "narrative": _narrative_from(data, score, True, language),
        "next_action": next_action(data.get("status") or "", language),
        "inputs": data,
        "missing_data": [],
        "wording": (
            "تقدير الذكاء الاصطناعي لاحتمالية التأخير — وليس حكماً بأن التوصية ستتأخر."
            if ar
            else "AI estimates a likelihood of delay — not a statement that the recommendation will be late."
        ),
        "advisory": True,
    }


def estimate_delay_risk(rec, user, language: str = "ar") -> AIAnalysis:
    lang = language_of(language)
    data = collect_risk_inputs(rec)
    meta = provider_meta()
    digest = content_hash(data, lang, meta["model"], ANALYSIS_VERSION)
    hit = cached_analysis(AIAnalysis.AnalysisType.RISK, "recommendation", rec.id, digest, meta["model"])
    if hit:
        return hit

    local = score_from_inputs(data, lang)
    prompt = render_prompt(
        "risk_analysis_v1.txt",
        language="Modern Standard Arabic" if lang == "ar" else "English",
        trusted_json=json.dumps({
            **data,
            "local_score": local["delay_risk_score"],
            "local_level": local["risk_level"],
            "local_factors": local["factors"],
        }, ensure_ascii=False),
    )
    llm_out = generate_structured(prompt, fallback={
        "narrative": local["narrative"],
        "recommended_attention": local["recommended_attention"],
        "confidence": local["confidence"],
    })
    if isinstance(llm_out.get("recommended_attention"), str) and text_matches_language(
        llm_out["recommended_attention"], lang
    ):
        local["recommended_attention"] = prefer_prose(
            llm_out["recommended_attention"], local["recommended_attention"], lang, 180
        )
    if isinstance(llm_out.get("narrative"), str):
        local["narrative"] = prefer_prose(llm_out["narrative"], local["narrative"], lang, 280)
    local["confidence"] = clamp_score(llm_out.get("confidence"), local["confidence"])
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.RISK,
        target_type="recommendation",
        target_id=rec.id,
        municipality=rec.report.municipality,
        digest=digest,
        output=local,
        confidence=local["confidence"],
        user=user,
    )


def delay_risk_score_only(rec) -> dict:
    """Cheap score used by dashboard insights (no LLM, no persistence)."""
    data = collect_risk_inputs(rec)
    return score_from_inputs(data, "ar")


def live_delay_risk(rec, language: str = "ar") -> dict:
    data = collect_risk_inputs(rec)
    return score_from_inputs(data, language_of(language))
