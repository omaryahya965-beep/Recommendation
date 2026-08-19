"""Draft action-plan suggestions. Never persisted as ActionPlan / never approved."""
from __future__ import annotations

import json
import re

from apps.ai.exceptions import AIError
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
from apps.ai.services.prompt_manager import render_prompt
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text
from apps.audits.models import Recommendation

ALLOWED_STATUSES = {
    Recommendation.Status.APPROVED_FOR_IMPLEMENTATION,
    Recommendation.Status.ACTION_PLAN_REQUIRED,
    Recommendation.Status.REVISION_REQUIRED,
    Recommendation.Status.ACTION_PLAN_REVIEW,
}

SENTENCE_SPLIT = re.compile(r"(?<=[\.!?؟])\s+|\n+")


def local_action_plan(rec, language: str) -> dict:
    ar = language != "en"
    text = (rec.text or "").strip()
    root = (rec.root_cause or "").strip()
    bits = [s.strip() for s in SENTENCE_SPLIT.split(text) if s.strip()][:4]
    if not bits:
        bits = [text[:180] or ("تنفيذ التوصية" if ar else "Implement the recommendation")]

    def step(title, description, days, evidence, criteria, role="employee"):
        return {
            "title": title,
            "description": description,
            "suggested_responsible_role": role,
            "suggested_duration_days": days,
            "required_evidence": evidence,
            "completion_criteria": criteria,
        }

    steps = []
    if ar:
        steps.append(step(
            "تحليل الفجوة وتوثيق الوضع الحالي",
            f"مراجعة التوصية REC-{rec.id} وتوثيق الفجوة الرقابية" + (f" المرتبطة بـ: {root[:180]}" if root else "."),
            7,
            "محضر مراجعة / وصف الوضع الحالي",
            "وثيقة فجوة معتمدة من رئيس الدائرة",
            "department_head",
        ))
        for i, bit in enumerate(bits[:3], start=1):
            steps.append(step(
                f"إجراء تصحيحي {i}",
                bit[:300],
                14,
                "مستند محدّث أو ما يثبت التنفيذ",
                "وجود مخرج يمكن التحقق منه مقابل نص الخطوة",
            ))
        steps.append(step(
            "التحقق الداخلي قبل الرفع للرقابة",
            "مراجعة اكتمال الخطوات والأدلة داخل الدائرة قبل إرسال التنفيذ.",
            5,
            "قائمة تحقق داخلية",
            "رئيس الدائرة يؤكد اكتمال الملف",
            "department_head",
        ))
        objective = f"معالجة التوصية REC-{rec.id} عبر خطوات قابلة للقياس دون تغيير حالة سير العمل تلقائياً."
        risks = ["تأخر اعتماد الإجراءات الداخلية", "عدم كفاية الأدلة المرفوعة"]
        dependencies = ["توفر صلاحيات الاعتماد داخل الدائرة", "وضوح المسؤول التنفيذي"]
    else:
        steps.append(step(
            "Document the current control gap",
            f"Review REC-{rec.id} and document the current weakness"
            + (f" related to: {root[:180]}" if root else "."),
            7,
            "Gap memo / current-state note",
            "Department head endorses the gap memo",
            "department_head",
        ))
        for i, bit in enumerate(bits[:3], start=1):
            steps.append(step(
                f"Corrective action {i}",
                bit[:300],
                14,
                "Updated document or implementation proof",
                "A verifiable output exists for this step",
            ))
        steps.append(step(
            "Internal completeness check",
            "Review steps and evidence inside the department before audit submission.",
            5,
            "Internal checklist",
            "Department head confirms the file is complete",
            "department_head",
        ))
        objective = f"Address REC-{rec.id} through measurable steps. This is a draft only."
        risks = ["Internal approval delays", "Insufficient supporting evidence"]
        dependencies = ["Delegated approval authority", "Named executor selected by management"]

    return {
        "objective": objective,
        "steps": steps,
        "risks": risks,
        "dependencies": dependencies,
        "confidence": 68,
        "draft_only": True,
        "does_not_create_action_plan": True,
    }


def _merge(local: dict, llm: dict) -> dict:
    merged = dict(local)
    if isinstance(llm.get("objective"), str) and llm["objective"].strip():
        merged["objective"] = llm["objective"].strip()[:500]
    if isinstance(llm.get("steps"), list) and llm["steps"]:
        steps = []
        for raw in llm["steps"][:8]:
            if not isinstance(raw, dict):
                continue
            role = raw.get("suggested_responsible_role") or "employee"
            if role not in ("employee", "department_head", "audit"):
                role = "employee"
            try:
                days = int(raw.get("suggested_duration_days") or 14)
            except (TypeError, ValueError):
                days = 14
            title = str(raw.get("title") or "").strip()
            if not title:
                continue
            steps.append({
                "title": title[:255],
                "description": str(raw.get("description") or "")[:800],
                "suggested_responsible_role": role,
                "suggested_duration_days": max(1, min(180, days)),
                "required_evidence": str(raw.get("required_evidence") or "")[:300],
                "completion_criteria": str(raw.get("completion_criteria") or "")[:300],
            })
        if steps:
            merged["steps"] = steps
    if isinstance(llm.get("risks"), list):
        merged["risks"] = [str(x)[:200] for x in llm["risks"][:8]]
    if isinstance(llm.get("dependencies"), list):
        merged["dependencies"] = [str(x)[:200] for x in llm["dependencies"][:8]]
    merged["confidence"] = clamp_score(llm.get("confidence"), merged["confidence"])
    merged["draft_only"] = True
    merged["does_not_create_action_plan"] = True
    return merged


def suggest_action_plan(rec, user, language: str = "ar") -> AIAnalysis:
    if rec.status not in ALLOWED_STATUSES:
        raise AIError(
            "Action-plan suggestions are available only after the recommendation is ratified "
            "and a plan is expected.",
            code="not_eligible",
            http_status=409,
        )
    lang = language_of(language)
    meta = provider_meta()
    digest = content_hash(rec.text, rec.root_cause, rec.status, lang, meta["model"])
    hit = cached_analysis(AIAnalysis.AnalysisType.ACTION_PLAN, "recommendation", rec.id, digest, meta["model"])
    if hit:
        return hit

    local = local_action_plan(rec, lang)
    prompt = render_prompt(
        "action_plan_v1.txt",
        language="Modern Standard Arabic" if lang == "ar" else "English",
        trusted_json=json.dumps(recommendation_public_facts(rec), ensure_ascii=False),
        untrusted_text=scrub_text(rec.text),
        untrusted_root_cause=scrub_text(rec.root_cause),
    )
    llm_out = generate_structured(prompt, fallback=local)
    output = _merge(local, llm_out)
    output["disclaimer"] = (
        "مسودة مقترحة فقط. يجب على الإدارة مراجعتها وتعديلها وتقديمها عبر سير العمل المعتمد."
        if lang == "ar"
        else "Draft suggestion only. Management must review, edit, and submit it through the existing workflow."
    )
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.ACTION_PLAN,
        target_type="recommendation",
        target_id=rec.id,
        municipality=rec.report.municipality,
        digest=digest,
        output=output,
        confidence=output.get("confidence"),
        user=user,
    )
