"""Minimize personal data sent to external AI providers."""
from __future__ import annotations

import re

EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
PHONE = re.compile(r"\b(?:\+?\d[\d\s\-()]{7,}\d)\b")
SECRETISH = re.compile(r"(password|token|secret|api[_-]?key)\s*[:=]\s*\S+", re.I)


def scrub_text(value: str | None, limit: int = 4000) -> str:
    text = value or ""
    text = EMAIL.sub("[redacted-email]", text)
    text = PHONE.sub("[redacted-phone]", text)
    text = SECRETISH.sub("[redacted-secret]", text)
    text = text.replace("\x00", " ")
    return text[:limit]


def recommendation_public_facts(rec) -> dict:
    plan = getattr(rec, "action_plan", None)
    return {
        "id": rec.id,
        "reference": f"REC-{rec.id}",
        "status": rec.status,
        "risk_level": rec.risk_level,
        "priority_score": rec.priority_score,
        "department": rec.report.department.name,
        "report_title": rec.report.title,
        "report_id": rec.report_id,
        "is_recurring_flagged": rec.is_recurring,
        "recurrence_confirmed": rec.recurrence_confirmed,
        "has_root_cause": bool((rec.root_cause or "").strip()),
        "target_date": str(plan.target_date) if plan else None,
        "plan_status": plan.status if plan else None,
        "has_response": hasattr(rec, "response") and rec.response is not None,
    }
