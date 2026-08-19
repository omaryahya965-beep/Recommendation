"""Parse labelled recommendation text written by the create-recommendation wizard.

Headings are part of the stored `Recommendation.text` contract — keep them in
sync with `frontend/lib/finding.ts`. Changing a heading breaks old records.
"""
from __future__ import annotations

import re
from typing import TypedDict

HEADINGS = {
    "title": "العنوان",
    "condition": "الوضع القائم",
    "criteria": "المعيار",
    "effect": "الأثر",
    "statement": "التوصية",
    "objective": "الهدف",
    "required_action": "الإجراء المطلوب",
    "outcome": "النتيجة المتوقعة",
    "success": "مؤشر النجاح",
    "evidence": "الأدلة المتوقعة",
    "notes": "الملاحظات",
}

HEADING_ALIASES = {
    "الملاحظة": "condition",
    "المخاطر": "effect",
    "Finding": "condition",
    "Objective": "objective",
    "Risks": "effect",
    "Recommendation": "statement",
    "Success Indicator": "success",
}

SECTION_ORDER = tuple(HEADINGS.keys())

_HEADING_LOOKUP: dict[str, str] = {heading: sid for sid, heading in HEADINGS.items()}
_HEADING_LOOKUP.update(HEADING_ALIASES)

_HEADING_PATTERN = "|".join(
    re.escape(name) for name in [*HEADINGS.values(), *HEADING_ALIASES.keys()]
)
_HEADING_LINE = re.compile(rf"^({_HEADING_PATTERN}):\s*$")

# Words that appear in every wizard record; they must not drive similarity.
_STRUCTURAL_STOP = {
    "العنوان", "الوضع", "القائم", "المعيار", "الاثر", "الأثر", "التوصيه", "التوصية",
    "الهدف", "الاجراء", "الإجراء", "المطلوب", "النتيجه", "النتيجة", "المتوقعه",
    "المتوقعة", "مؤشر", "النجاح", "الادله", "الأدلة", "الملاحظات", "title",
    "condition", "criteria", "finding", "recommendation", "objective",
}


class ParsedFinding(TypedDict):
    sections: dict[str, str]
    preamble: str
    structured: bool


def parse_finding(text: str | None) -> ParsedFinding:
    value = (text or "").strip()
    if not value:
        return {"sections": {}, "preamble": "", "structured": False}

    sections: dict[str, str] = {}
    preamble: list[str] = []
    current: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer, current
        if current:
            body = "\n".join(buffer).strip()
            if body:
                sections[current] = body
        buffer = []

    for line in value.splitlines():
        match = _HEADING_LINE.match(line.strip())
        if match:
            flush()
            current = _HEADING_LOOKUP[match.group(1)]
            continue
        if current:
            buffer.append(line)
        else:
            preamble.append(line)
    flush()

    return {
        "sections": sections,
        "preamble": "\n".join(preamble).strip(),
        "structured": bool(sections),
    }


def section_body(text: str | None, section_id: str) -> str:
    return parse_finding(text)["sections"].get(section_id, "").strip()


def clip(value: str | None, limit: int = 220) -> str:
    clean = re.sub(r"\s+", " ", (value or "").strip())
    if len(clean) <= limit:
        return clean
    return clean[: limit].rstrip() + "…"


def case_title(text: str | None, max_len: int = 90) -> str:
    parsed = parse_finding(text)
    source = (
        parsed["sections"].get("title")
        or parsed["sections"].get("condition")
        or parsed["preamble"]
        or parsed["sections"].get("statement")
        or (text or "")
    )
    first = next((line.strip() for line in source.splitlines() if line.strip()), "")
    return clip(first, max_len)


def brief_excerpt(text: str | None, limit: int = 180) -> str:
    """One-line snippet for lists and similarity cards — never the full dump."""
    parsed = parse_finding(text)
    for key in ("title", "condition", "statement"):
        body = parsed["sections"].get(key)
        if body:
            return clip(body.splitlines()[0], limit)
    if parsed["preamble"]:
        return clip(parsed["preamble"].splitlines()[0], limit)
    return clip(text, limit)


def semantic_payload(text: str | None, root_cause: str | None = None) -> str:
    """Heading-free text used for embeddings so template labels do not match."""
    parsed = parse_finding(text)
    parts: list[str] = []
    if parsed["structured"]:
        for key in (
            "title",
            "condition",
            "criteria",
            "effect",
            "statement",
            "objective",
            "required_action",
            "root_cause",
        ):
            body = parsed["sections"].get(key)
            if body:
                parts.append(body)
        if parsed["preamble"]:
            parts.insert(0, parsed["preamble"])
    else:
        if parsed["preamble"]:
            parts.append(parsed["preamble"])
        elif text:
            parts.append(text)
    if (root_cause or "").strip():
        parts.append(root_cause.strip())
    payload = "\n".join(p.strip() for p in parts if p and p.strip())
    return payload.strip() or (text or "").strip()


def is_repeated_placeholder(text: str | None) -> bool:
    """True when several labelled sections repeat the same short token."""
    bodies = [body.strip() for body in parse_finding(text)["sections"].values() if body.strip()]
    if len(bodies) < 3:
        return False
    unique = {re.sub(r"\s+", " ", b) for b in bodies}
    if len(unique) != 1:
        return False
    only = next(iter(unique))
    return len(only) < 48


def filled_sections(text: str | None) -> list[str]:
    parsed = parse_finding(text)
    return [key for key in SECTION_ORDER if parsed["sections"].get(key, "").strip()]


def structural_tokens() -> set[str]:
    return set(_STRUCTURAL_STOP)
