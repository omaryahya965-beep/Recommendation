"""Recommendation quality/risk analysis. Never overwrites the auditor's text."""
from __future__ import annotations

import json
import re

from apps.ai import taxonomy
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
from apps.ai.services.sanitizer import recommendation_public_facts, scrub_text
from apps.audits.finding import (
    brief_excerpt,
    case_title,
    clip,
    filled_sections,
    is_repeated_placeholder,
    parse_finding,
    semantic_payload,
)
from apps.audits.models import Recommendation

ANALYSIS_VERSION = "analysis_v3"

ACTION_VERBS = re.compile(
    r"يجب|ينبغي|يتعين|يلزم|تحديث|وضع|إعداد|تطبيق|تنفيذ|اعتماد|إصدار|فصل|توثيق|"
    r"ensure|implement|establish|update|adopt|define|issue|prepare|segregat",
    re.I,
)
MEASURE_HINT = re.compile(
    r"%|نسبة|عدد|مؤشر|kpi|percent|مرة|وثيق|إجراء موثق|measurable",
    re.I,
)
GENERIC_ISSUE = re.compile(
    r"lack of information|insufficient information|نقص المعلومات|لا توجد معلومات|"
    r"unclear expected impact|الأثر المتوقع غير|"
    r"lack of a target date|no target date|لا يوجد موعد|"
    r"lack of response|no response|لا يوجد رد|رد الإدارة|"
    r"required actions\.?$|الإجراءات المطلوبة",
    re.I,
)

def _band(score: int) -> str:
    if score >= 75:
        return "HIGH"
    if score >= 50:
        return "MEDIUM"
    return "LOW"


def _word_count(value: str) -> int:
    return len(re.findall(r"[\w\u0600-\u06FF]+", value or ""))


def _finding_facts(rec) -> dict:
    parsed = parse_finding(rec.text)
    sections = {
        key: clip(parsed["sections"].get(key, ""), 500)
        for key in parsed["sections"]
    }
    return {
        **recommendation_public_facts(rec),
        "title": case_title(rec.text),
        "sections": sections,
        "filled_sections": filled_sections(rec.text),
        "root_cause_text": scrub_text(rec.root_cause, 500),
        "status_label": rec.status,
        "repeated_placeholder": is_repeated_placeholder(rec.text),
        "next_action": next_action(rec.status, "ar"),
    }


def local_recommendation_analysis(rec, language: str) -> dict:
    ar = language != "en"
    parsed = parse_finding(rec.text)
    sections = parsed["sections"]
    condition = sections.get("condition") or parsed["preamble"] or (rec.text or "")
    criteria = sections.get("criteria", "")
    effect = sections.get("effect", "")
    statement = sections.get("statement") or ("" if parsed["structured"] else rec.text or "")
    required_action = sections.get("required_action", "")
    success = sections.get("success") or sections.get("outcome", "")
    root = (rec.root_cause or "").strip()
    title = case_title(rec.text)
    placeholder = is_repeated_placeholder(rec.text)

    cond_words = _word_count(condition)
    stmt_words = _word_count(statement)
    clarity = 40
    if cond_words >= 8:
        clarity = 72
    if cond_words >= 18:
        clarity = 88
    if parsed["structured"] and criteria:
        clarity = min(100, clarity + 6)
    if placeholder:
        clarity = min(clarity, 28)

    specificity = 48
    if criteria and _word_count(criteria) >= 6:
        specificity = 78
    if effect and _word_count(effect) >= 6:
        specificity = min(100, specificity + 10)
    if placeholder:
        specificity = min(specificity, 30)

    action_src = f"{statement} {required_action}"
    actionability = 82 if ACTION_VERBS.search(action_src) and stmt_words >= 5 else 50
    if stmt_words >= 12 and ACTION_VERBS.search(action_src):
        actionability = 90
    if stmt_words < 4:
        actionability = min(actionability, 42)
    if placeholder:
        actionability = min(actionability, 30)

    measurability = 80 if MEASURE_HINT.search(f"{success} {statement} {required_action}") else 52
    if success and _word_count(success) >= 4:
        measurability = max(measurability, 82)
    if placeholder:
        measurability = min(measurability, 35)

    # The responsible party is the report department — not a word in the finding text.
    party = 78
    if required_action:
        party = 88
    deadline = 70 if rec.status in (
        Recommendation.Status.DRAFT,
        Recommendation.Status.PENDING_RESPONSE,
        Recommendation.Status.AUDIT_REVIEW,
        Recommendation.Status.RETURNED_FOR_REVISION,
        Recommendation.Status.PENDING_COUNCIL,
        Recommendation.Status.ACTION_PLAN_REQUIRED,
    ) else (80 if getattr(getattr(rec, "action_plan", None), "target_date", None) else 40)
    root_score = 88 if _word_count(root) >= 4 else (70 if sections.get("notes") else 40)
    if placeholder:
        root_score = min(root_score, 35)

    quality = round(
        0.22 * clarity
        + 0.16 * specificity
        + 0.20 * actionability
        + 0.12 * measurability
        + 0.10 * party
        + 0.08 * deadline
        + 0.12 * root_score
    )

    risk_base = {"high": 82, "medium": 58, "low": 32}.get(rec.risk_level, 50)
    impact = 80 if effect and _word_count(effect) >= 6 else risk_base
    likelihood = 70 if rec.is_recurring else 55
    urgency = 75 if rec.risk_level == "high" else 50
    blob = semantic_payload(rec.text, rec.root_cause)
    # Named lookups: these used to index CATEGORY_RULES positionally, so
    # reordering the list silently rewired the risk dimensions.
    financial = 80 if taxonomy.matches("FINANCE", blob) else risk_base
    compliance = (
        80 if taxonomy.matches("COMPLIANCE", blob) else max(30, risk_base - 5)
    )
    operational = 78 if taxonomy.matches("OPERATIONS", blob) else risk_base
    reputational = 70 if rec.risk_level == "high" else 40
    risk_score = round(
        0.25 * impact + 0.15 * likelihood + 0.15 * urgency
        + 0.15 * operational + 0.15 * financial + 0.10 * compliance + 0.05 * reputational
    )

    # Scored classification over the shared taxonomy. The finding text leads;
    # the department name only corroborates, so a finance department raising
    # an IT finding is still classified from what the finding actually says.
    category = taxonomy.classify(blob, rec.report.department.name)

    if rec.risk_level == "high":
        priority = "HIGH"
    elif rec.risk_level == "low" and quality >= 60:
        priority = "LOW"
    elif quality >= 80 and risk_score >= 70:
        priority = "HIGH"
    else:
        priority = "MEDIUM"

    issues, suggestions = [], []
    if placeholder:
        issues.append(
            "أقسام الملاحظة مكررة بنفس النص المختصر ولا تصف وضعاً رقابياً قابلاً للمتابعة."
            if ar
            else "Finding sections repeat the same short token and do not describe an auditable condition."
        )
        suggestions.append(
            "اكتب الوضع القائم والمعيار والأثر والتوصية بجمل مختلفة ومحددة."
            if ar
            else "Write distinct sentences for the condition, criteria, effect, and recommendation."
        )
    if cond_words < 8:
        issues.append(
            "الوضع القائم غير كافٍ لوصف ما وُجد أثناء التدقيق."
            if ar
            else "The condition does not describe what was actually observed."
        )
        suggestions.append(
            "صف الواقع المرصود: أين وقع، وما الذي وُجد، ومن دون أحكام عامة."
            if ar
            else "Describe the observed reality: where it occurred and what was found, without generic judgments."
        )
    if parsed["structured"] and _word_count(criteria) < 5:
        issues.append(
            "قسم المعيار فارغ أو عام — لا يتضح النظام أو الإجراء الذي تمت المقارنة به."
            if ar
            else "The criteria section is empty or generic — the benchmark procedure is unclear."
        )
        suggestions.append(
            "اذكر النظام أو التعليمات أو الإجراء المعتمد الذي كان يجب تطبيقه."
            if ar
            else "Cite the regulation, instruction, or approved procedure used as the benchmark."
        )
    if parsed["structured"] and _word_count(effect) < 5:
        issues.append(
            "الأثر غير مبيّن: لا يُعرف الضرر المالي أو التشغيلي أو الرقابي المترتب."
            if ar
            else "Impact is not stated, so the resulting harm is unclear."
        )
        suggestions.append(
            "حدّد الأثر المترتب على الوضع القائم (مالي، تشغيلي، رقابي، أو سمعي)."
            if ar
            else "State the financial, operational, control, or reputational impact."
        )
    if stmt_words < 5:
        issues.append(
            "نص التوصية لا يحدّد إجراءً تنفيذياً واضحاً يمكن متابعة إنجازه."
            if ar
            else "The recommendation does not specify a followable corrective action."
        )
        suggestions.append(
            "صغ التوصية بفعل تنفيذي وقابل للقياس (فصل المهام، اعتماد إجراء، تحديث نظام…)."
            if ar
            else "Phrase the recommendation as a measurable action (segregate duties, adopt a procedure, update a system)."
        )
    elif not ACTION_VERBS.search(action_src):
        issues.append(
            "صياغة التوصية أقل قابلية للتنفيذ."
            if ar
            else "The recommendation is weakly actionable."
        )
        suggestions.append(
            "استخدم فعلاً تنفيذياً واضحاً يحدد ما يجب أن تفعله الدائرة."
            if ar
            else "Use a clear implementation verb that states what the department must do."
        )
    if _word_count(root) < 4:
        issues.append(
            "السبب الجذري غير موثّق في الحقل المخصص."
            if ar
            else "Root cause is not documented in the dedicated field."
        )
        suggestions.append(
            "وثّق سبب الضعف الرقابي (غياب إجراء، تداخل صلاحيات، عدم فصل مهام…)."
            if ar
            else "Document the control weakness (missing procedure, conflicting authority, lack of segregation)."
        )
    if parsed["structured"] and not success and not MEASURE_HINT.search(action_src):
        suggestions.append(
            "أضف مؤشر نجاح يمكن للرقابة التحقق منه عند الإغلاق."
            if ar
            else "Add a success indicator that audit can verify at closure."
        )

    dept = rec.report.department.name
    found = clip(condition if condition and not placeholder else statement, 160)
    if ar:
        brief = (
            f"REC-{rec.id} — {clip(title, 72)}. الدائرة: {dept}. "
            f"{'ما وُجد: ' + found + '. ' if found else ''}"
            f"الخطورة {risk_label(rec.risk_level, language)}، والحالة «{status_label(rec.status, language)}». "
            f"المطلوب الآن: {next_action(rec.status, language)}."
        )
    else:
        brief = (
            f"REC-{rec.id} — {clip(title, 72)}. Department: {dept}. "
            f"{'Found: ' + found + '. ' if found else ''}"
            f"Risk {risk_label(rec.risk_level, language)}; status “{status_label(rec.status, language)}”. "
            f"Required now: {next_action(rec.status, language)}."
        )

    resolve = clip(required_action or statement or condition, 280) if not placeholder else (
        "إعادة صياغة الملاحظة بأقسام مكتملة قبل متابعة التنفيذ."
        if ar
        else "Rewrite the finding with complete sections before implementation follow-up."
    )

    tokens = re.findall(r"[\w\u0600-\u06FF]{3,}", blob.lower())
    keywords = []
    for tok in tokens:
        if tok not in keywords:
            keywords.append(tok)
        if len(keywords) >= 8:
            break

    return {
        "quality_score": clamp_score(quality),
        "quality_band": _band(quality),
        "clarity_score": clamp_score(clarity),
        "specificity_score": clamp_score(specificity),
        "actionability_score": clamp_score(actionability),
        "measurability_score": clamp_score(measurability),
        "responsible_party_score": clamp_score(party),
        "deadline_clarity_score": clamp_score(deadline),
        "root_cause_clarity_score": clamp_score(root_score),
        "risk_score": clamp_score(risk_score),
        "impact_score": clamp_score(impact),
        "likelihood_score": clamp_score(likelihood),
        "urgency_score": clamp_score(urgency),
        "operational_risk": clamp_score(operational),
        "financial_risk": clamp_score(financial),
        "compliance_risk": clamp_score(compliance),
        "reputational_risk": clamp_score(reputational),
        "suggested_priority": priority,
        "suggested_category": category,
        "suggested_category_label": taxonomy.category_label(category, language),
        # Named so the UI can never present this as the auditor's own score.
        "priority_is_suggestion_only": True,
        "department_relevance": dept,
        "keywords": keywords,
        "issues": issues[:3],
        "suggestions": suggestions[:3],
        "brief": brief,
        "title": title,
        "next_action": next_action(rec.status, language),
        "how_to_resolve": resolve,
        "excerpt": brief_excerpt(rec.text),
        "confidence": 76 if issues else 86,
        "advisory": True,
        "does_not_change_workflow": True,
    }


def _specific_enough(item: str, rec) -> bool:
    text = (item or "").strip()
    if len(text) < 24:
        return False
    if GENERIC_ISSUE.search(text):
        return False
    blob = f"{rec.text} {rec.root_cause} {rec.report.department.name}"
    tokens = [t for t in re.findall(r"[\w\u0600-\u06FF]{4,}", text.lower())]
    if not tokens:
        return False
    return any(tok in blob.lower() for tok in tokens[:12]) or any(
        marker in text
        for marker in ("الوضع القائم", "المعيار", "الأثر", "التوصية", "السبب", "condition", "criteria", "root cause")
    )


def _merge_llm(local: dict, llm: dict, rec, language: str) -> dict:
    merged = dict(local)
    score_keys = [
        "quality_score", "clarity_score", "specificity_score", "actionability_score",
        "measurability_score", "responsible_party_score", "deadline_clarity_score",
        "root_cause_clarity_score", "risk_score", "impact_score", "likelihood_score",
        "urgency_score", "operational_risk", "financial_risk", "compliance_risk",
        "reputational_risk", "confidence",
    ]
    for key in score_keys:
        if key not in llm:
            continue
        blended = clamp_score(0.6 * local[key] + 0.4 * clamp_score(llm.get(key), local[key]))
        if key == "quality_score" and local[key] >= 55:
            blended = max(blended, local[key] - 12)
        merged[key] = blended
    merged["quality_band"] = _band(merged["quality_score"])
    if llm.get("suggested_priority") in ("HIGH", "MEDIUM", "LOW"):
        merged["suggested_priority"] = llm["suggested_priority"]
    if llm.get("suggested_category") in taxonomy.CATEGORY_KEYS:
        merged["suggested_category"] = llm["suggested_category"]
    merged["suggested_category_label"] = taxonomy.category_label(
        merged["suggested_category"], language
    )

    llm_issues = [
        str(x).strip()[:180]
        for x in (llm.get("issues") or [])
        if str(x).strip() and text_matches_language(str(x), language)
    ]
    llm_suggestions = [
        str(x).strip()[:180]
        for x in (llm.get("suggestions") or [])
        if str(x).strip() and text_matches_language(str(x), language)
    ]
    merged["issues"] = list(dict.fromkeys(
        [*local["issues"], *[i for i in llm_issues if _specific_enough(i, rec)]]
    ))[:3]
    merged["suggestions"] = list(dict.fromkeys(
        [*local["suggestions"], *[s for s in llm_suggestions if _specific_enough(s, rec)]]
    ))[:3]

    merged["brief"] = prefer_prose(llm.get("brief"), local["brief"], language, 420)
    merged["how_to_resolve"] = prefer_prose(
        llm.get("how_to_resolve"), local["how_to_resolve"], language, 220
    )
    merged["next_action"] = prefer_prose(
        llm.get("next_action"), local["next_action"], language, 160
    )

    if isinstance(llm.get("keywords"), list):
        merged["keywords"] = [str(x)[:40] for x in llm["keywords"][:10]]
    merged["department_relevance"] = local["department_relevance"]
    merged["advisory"] = True
    merged["does_not_change_workflow"] = True
    return merged


def analyze_recommendation(rec, user, language: str = "ar") -> AIAnalysis:
    lang = language_of(language)
    meta = provider_meta()
    digest = content_hash(
        rec.text, rec.root_cause, rec.risk_level, rec.status,
        rec.report.department.name, lang, meta["model"], ANALYSIS_VERSION,
    )
    hit = cached_analysis(AIAnalysis.AnalysisType.RECOMMENDATION, "recommendation", rec.id, digest, meta["model"])
    if hit:
        return hit

    local = local_recommendation_analysis(rec, lang)
    facts = _finding_facts(rec)
    prompt = render_prompt(
        "recommendation_analysis_v1.txt",
        language="Modern Standard Arabic" if lang == "ar" else "English",
        trusted_json=json.dumps(facts, ensure_ascii=False),
        untrusted_text=scrub_text(rec.text),
        untrusted_root_cause=scrub_text(rec.root_cause),
    )
    llm_out = generate_structured(prompt, fallback=local)
    output = _merge_llm(local, llm_out, rec, lang)
    output["disclaimer"] = (
        "تحليل مساعد لهذا الملف تحديداً. لا يغيّر حالة التوصية ولا يغني عن اعتماد بشري."
        if lang == "ar"
        else "Advisory analysis of this file. It does not change workflow status and does not replace human approval."
    )
    return store_analysis(
        analysis_type=AIAnalysis.AnalysisType.RECOMMENDATION,
        target_type="recommendation",
        target_id=rec.id,
        municipality=rec.report.municipality,
        digest=digest,
        output=output,
        confidence=output.get("confidence"),
        user=user,
    )


def live_recommendation_analysis(rec, language: str = "ar") -> dict:
    """Deterministic analysis used when nothing is stored yet."""
    return local_recommendation_analysis(rec, language_of(language))
