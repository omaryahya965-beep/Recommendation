"""Similarity upgrade on top of apps.ai_similarity. Human confirms recurrence."""
from __future__ import annotations

from django.conf import settings

from apps.ai.models import AIAnalysis
from apps.ai.providers import provider_meta
from apps.ai.services.case_copy import status_label
from apps.ai.services.common import cached_analysis, content_hash, language_of, store_analysis
from apps.ai_similarity.service import _normalize, ensure_embedding, find_similar
from apps.audits.finding import brief_excerpt, case_title, semantic_payload, structural_tokens

# Matches below this are noise (shared headings, generic verbs) — do not show them.
DISPLAY_MIN_SCORE = 0.52
DISPLAY_LIMIT = 3
ANALYSIS_VERSION = "similar_v2"


def _token_set(text: str) -> set[str]:
    stop = structural_tokens()
    return {
        t for t in _normalize(text or "").split()
        if len(t) > 2 and t not in stop
    }


def explain_match(rec, other, score: float, language: str) -> dict:
    ar = language != "en"
    reasons = []
    same_dept = rec.report.department_id == other.report.department_id
    if same_dept:
        reasons.append("نفس الدائرة" if ar else "same department")

    overlap = _token_set(semantic_payload(rec.text)) & _token_set(semantic_payload(other.text))
    if len(overlap) >= 3:
        sample = "، ".join(sorted(overlap)[:4]) if ar else ", ".join(sorted(overlap)[:4])
        reasons.append(
            f"تقاطع في مضمون الملاحظة ({sample})" if ar
            else f"overlapping finding content ({sample})"
        )
    root_overlap = _token_set(rec.root_cause) & _token_set(other.root_cause)
    if rec.root_cause and other.root_cause and root_overlap:
        reasons.append("سبب جذري متشابه" if ar else "similar root cause")
    if rec.risk_level == other.risk_level:
        reasons.append("نفس مستوى الخطورة المسجّل" if ar else "same recorded risk level")

    weakness = {"ضعف", "غياب", "عدم", "رقاب", "فصل", "صلاح", "control", "segregat", "lack"}
    blob_a = _normalize(f"{semantic_payload(rec.text, rec.root_cause)}")
    blob_b = _normalize(f"{semantic_payload(other.text, other.root_cause)}")
    if any(w in blob_a and w in blob_b for w in weakness):
        reasons.append("ضعف رقابي مشابه" if ar else "same control weakness")

    other_plan = getattr(other, "action_plan", None)
    if other_plan and other_plan.notes:
        if _token_set(rec.text) & _token_set(other_plan.notes):
            reasons.append(
                "الإجراء التصحيحي السابق مشابه"
                if ar
                else "previous recommendation had similar corrective action"
            )
    elif other_plan:
        reasons.append(
            "توجد خطة عمل سابقة على التوصية المشابهة"
            if ar
            else "a prior similar recommendation had an action plan"
        )

    if not reasons:
        reasons.append(
            "تشابه دلالي في نص التوصية" if ar else "semantic similarity in recommendation text"
        )

    threshold = settings.AI_SIMILARITY_THRESHOLD
    likely = score >= threshold and (same_dept or bool(root_overlap) or len(overlap) >= 4)
    title = case_title(other.text) or brief_excerpt(other.text)
    return {
        "matched_id": other.id,
        "matched_reference": f"REC-{other.id}",
        "matched_title": title,
        "matched_text": brief_excerpt(other.text, 180),
        "matched_status": other.status,
        "matched_status_label": status_label(other.status, language),
        "matched_department": other.report.department.name,
        "matched_report": other.report.title,
        "similarity_score": round(float(score), 4),
        "similarity_percent": int(round(float(score) * 100)),
        "reasons": reasons,
        "suggested_recurring": "LIKELY_RECURRING" if likely else "POSSIBLY_RELATED",
        "human_confirmed": bool(rec.recurrence_confirmed and rec.similar_recommendation_id == other.id),
        "requires_human_confirmation": True,
    }


def similar_for(rec, user, language: str = "ar", top_k: int | None = None) -> AIAnalysis:
    lang = language_of(language)
    meta = provider_meta()
    ensure_embedding(rec)
    digest = content_hash(
        semantic_payload(rec.text, rec.root_cause),
        rec.embedding_model,
        rec.embedding[:8] if rec.embedding else "",
        lang,
        meta["model"],
        ANALYSIS_VERSION,
    )
    hit = cached_analysis(AIAnalysis.AnalysisType.SIMILARITY, "recommendation", rec.id, digest, meta["model"])
    if hit:
        return hit

    k = min(top_k or DISPLAY_LIMIT, DISPLAY_LIMIT)
    matches = find_similar(rec, top_k=max(k * 3, 6), min_score=DISPLAY_MIN_SCORE)
    explained = [explain_match(rec, other, score, lang) for other, score in matches[:k]]
    likely = [m for m in explained if m["suggested_recurring"] == "LIKELY_RECURRING"]
    output = {
        "matches": explained,
        "likely_recurring_count": len(likely),
        "threshold": settings.AI_SIMILARITY_THRESHOLD,
        "display_min_score": DISPLAY_MIN_SCORE,
        "embedding_model": rec.embedding_model,
        "flagged_on_record": rec.is_recurring,
        "human_confirmed": rec.recurrence_confirmed,
        "disclaimer": (
            "لا تُعرض إلا التوصيات ذات التشابه الجوهري. تصنيف التكرار النهائي يتم بتأكيد بشري."
            if lang == "ar"
            else "Only material matches are shown. Recurring classification requires human confirmation."
        ),
        "confidence": 80 if explained else 40,
    }
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.SIMILARITY,
        target_type="recommendation",
        target_id=rec.id,
        municipality=rec.report.municipality,
        digest=digest,
        output=output,
        confidence=output["confidence"],
        user=user,
    )
