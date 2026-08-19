"""Advisory evidence analysis. Never performs final verification or closure."""
from __future__ import annotations

import json
import re

from apps.ai.models import AIAnalysis
from apps.ai.providers import provider_meta
from apps.ai.services.common import (
    cached_analysis,
    clamp_score,
    content_hash,
    generate_structured,
    language_of,
    store_analysis,
)
from apps.ai.services.document_text import extract_evidence_text, looks_like_instruction_injection
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text

DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|20\d{2})\b"
)
ENTITY_RE = re.compile(
    r"(مجلس|بلدية|دائرة|وزارة|مدير|رئيس|council|municipality|department|minister|director)",
    re.I,
)
SIGNATURE_RE = re.compile(
    r"(توقيع|ختم|اعتماد|مصادق|signed|signature|stamp|approved by|seal)",
    re.I,
)


def local_evidence_analysis(evidence, extraction: dict, language: str) -> dict:
    ar = language != "en"
    rec = evidence.recommendation
    step = evidence.step
    step_title = step.title if step else ""
    notes = evidence.notes or ""
    text = extraction.get("text") or ""
    blob = f"{text} {notes}".strip()
    extraction_ok = bool(extraction.get("extraction_ok"))

    step_tokens = {t for t in re.findall(r"[\w\u0600-\u06FF]{3,}", (step_title + " " + rec.text).lower())}
    doc_tokens = {t for t in re.findall(r"[\w\u0600-\u06FF]{3,}", blob.lower())}
    overlap = step_tokens & doc_tokens
    coverage = (len(overlap) / max(1, min(12, len(step_tokens)))) * 100

    if not extraction_ok and not notes:
        relevance, confidence = 15, 35
        appears = False
        summary = (
            "تعذر استخراج نص من هذا المستند. لم يُختلق أي محتوى."
            if ar
            else "Text could not be extracted from this document. No content was invented."
        )
        missing = [
            "نص قابل للقراءة من الملف" if ar else "Readable extracted text",
            "دليل تنفيذ مرتبط بالخطوة" if ar else "Implementation evidence linked to the step",
        ]
        matched = []
    else:
        relevance = 40
        if notes:
            relevance += 15
        if extraction_ok:
            relevance += 20
        if coverage >= 20:
            relevance += 15
        if SIGNATURE_RE.search(blob):
            relevance += 5
        relevance = clamp_score(relevance)
        appears = relevance >= 60 and (bool(overlap) or bool(notes))
        confidence = 55 if extraction_ok else 40
        if extraction_ok:
            summary = (text[:400] if text else notes[:400])
        else:
            summary = notes[:400] or (
                "لا يوجد نص مستخرج؛ الاعتماد على ملاحظات الرفع فقط."
                if ar
                else "No extracted text; only uploader notes are available."
            )
        matched = []
        if DATE_RE.search(blob):
            matched.append("تاريخ" if ar else "Date identified")
        if SIGNATURE_RE.search(blob):
            matched.append("إشارة إلى اعتماد/توقيع" if ar else "Approval/signature language")
        if overlap:
            matched.append("تقاطع مع نص الخطوة/التوصية" if ar else "Overlap with step/recommendation wording")
        if notes:
            matched.append("ملاحظات الرفع" if ar else "Uploader notes")
        missing = []
        if not DATE_RE.search(blob):
            missing.append("تاريخ الاعتماد أو التنفيذ" if ar else "Approval or implementation date")
        if not SIGNATURE_RE.search(blob):
            missing.append("ما يثبت الاعتماد" if ar else "Approval evidence")
        if step and coverage < 15:
            missing.append("ربط أوضح بمتطلبات الخطوة" if ar else "Clearer link to the action step")
        if not extraction_ok:
            missing.append("نص مستخرج من الملف" if ar else "Extracted document text")

    dates = DATE_RE.findall(blob)[:8]
    entities = []
    for match in ENTITY_RE.findall(blob):
        if match not in entities:
            entities.append(match)
        if len(entities) >= 8:
            break

    concerns = []
    if looks_like_instruction_injection(blob):
        concerns.append(
            "المستند يحتوي عبارات تشبه تعليمات للنظام؛ عُوملت كنص للمستند وليست تعليمات."
            if ar
            else "The document contains instruction-like language; it was treated as content, not as instructions."
        )
    if not extraction_ok:
        concerns.append(
            "تعذر استخراج النص — لا تستنتج محتوى غير ظاهر."
            if ar
            else "Text could not be extracted — do not infer unseen content."
        )

    return {
        "relevance_score": clamp_score(relevance),
        "confidence": clamp_score(confidence),
        "appears_to_support_step": bool(appears),
        "document_type": extraction.get("document_type") or "unknown",
        "summary": summary,
        "dates_found": dates,
        "entities": entities,
        "approval_or_signature_notes": (
            "عبارات اعتماد/توقيع ظاهرة في النص المستخرج."
            if SIGNATURE_RE.search(blob)
            else ("لا توجد عبارات اعتماد واضحة في النص المستخرج." if ar else "No clear approval language in extracted text.")
        ),
        "matched_requirements": matched,
        "missing_information": missing,
        "concerns": concerns,
        "extraction_ok": extraction_ok,
        "extraction_error": extraction.get("error") or "",
        "advisory": True,
        "does_not_verify_or_close": True,
    }


def _merge(local: dict, llm: dict) -> dict:
    merged = dict(local)
    for key in ("relevance_score", "confidence"):
        if key in llm:
            merged[key] = clamp_score(llm.get(key), merged[key])
    if isinstance(llm.get("appears_to_support_step"), bool):
        merged["appears_to_support_step"] = llm["appears_to_support_step"]
    if isinstance(llm.get("summary"), str) and local["extraction_ok"]:
        merged["summary"] = llm["summary"][:800]
    elif not local["extraction_ok"]:
        # Never let the model invent document contents when extraction failed.
        merged["summary"] = local["summary"]
        merged["appears_to_support_step"] = False
    for list_key in ("matched_requirements", "missing_information", "concerns", "dates_found", "entities"):
        if isinstance(llm.get(list_key), list) and local["extraction_ok"]:
            merged[list_key] = [str(x)[:200] for x in llm[list_key][:10]]
    if isinstance(llm.get("document_type"), str) and llm["document_type"].strip():
        merged["document_type"] = llm["document_type"][:40]
    if isinstance(llm.get("approval_or_signature_notes"), str) and local["extraction_ok"]:
        merged["approval_or_signature_notes"] = llm["approval_or_signature_notes"][:300]
    # Grounding: dates must appear in extracted text.
    extracted = (local.get("summary") or "") + " " + " ".join(local.get("dates_found") or [])
    grounded_dates = []
    for token in merged.get("dates_found") or []:
        if str(token) in extracted or str(token) in (local.get("dates_found") or []):
            grounded_dates.append(str(token))
    merged["dates_found"] = grounded_dates or local.get("dates_found") or []
    merged["extraction_ok"] = local["extraction_ok"]
    merged["advisory"] = True
    merged["does_not_verify_or_close"] = True
    return merged


def analyze_evidence(evidence, user, language: str = "ar") -> AIAnalysis:
    lang = language_of(language)
    extraction = extract_evidence_text(evidence)
    meta = provider_meta()
    digest = content_hash(
        evidence.id,
        extraction.get("text", "")[:2000],
        evidence.notes,
        evidence.step_id,
        lang,
        meta["model"],
    )
    hit = cached_analysis(AIAnalysis.AnalysisType.EVIDENCE, "evidence", evidence.id, digest, meta["model"])
    if hit:
        return hit

    local = local_evidence_analysis(evidence, extraction, lang)
    rec = evidence.recommendation
    trusted = recommendation_public_facts(rec)
    trusted["evidence_id"] = evidence.id
    trusted["step_id"] = evidence.step_id
    trusted["extraction_ok"] = extraction.get("extraction_ok")
    trusted["document_type"] = extraction.get("document_type")
    prompt = render_prompt(
        "evidence_analysis_v1.txt",
        language="Modern Standard Arabic" if lang == "ar" else "English",
        trusted_json=json.dumps(trusted, ensure_ascii=False),
        untrusted_step=scrub_text(evidence.step.title if evidence.step_id else ""),
        untrusted_document=scrub_text(extraction.get("text") or "", limit=8000),
    )
    llm_out = generate_structured(prompt, fallback=local)
    output = _merge(local, llm_out)
    output["disclaimer"] = (
        "مراجعة استشارية. التحقق النهائي والإغلاق يتمان فقط عبر مسار التدقيق والمجلس."
        if lang == "ar"
        else "Advisory review. Final verification and closure remain with audit and council workflow."
    )
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.EVIDENCE,
        target_type="evidence",
        target_id=evidence.id,
        municipality=rec.report.municipality,
        digest=digest,
        output=output,
        confidence=output.get("confidence"),
        user=user,
    )
