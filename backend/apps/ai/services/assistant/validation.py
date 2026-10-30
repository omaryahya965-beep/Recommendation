"""Checks an assistant answer against the database before anyone sees it.

Round 2, 2.4. Every case or report reference must exist and be in the asking
user's scope; every date written next to a case must be one of that case's
real dates; a claim that a case has no action plan, or a stated plan
progress, must match the plan. The runner retries once with the problems
listed, then falls back to `safe_answer`, which is built only from records.
"""
from __future__ import annotations

import datetime
import re
from dataclasses import dataclass

from django.utils import timezone

from apps.core.arabic import _MONTHS as AR_MONTHS
from apps.core.arabic import date_ar
from apps.core.permissions import scope_reports
from apps.core.refs import record_code

REF = re.compile(r"(?<![A-Za-z])(REC|RPT)[-\s]?0*(\d+)\b", re.IGNORECASE)
EN_MONTHS = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_EN = re.compile(r"\b(\d{1,2})\s+(" + "|".join(EN_MONTHS) + r")\s+(\d{4})\b", re.IGNORECASE)
_EN_US = re.compile(r"\b(" + "|".join(EN_MONTHS) + r")\s+(\d{1,2}),?\s+(\d{4})\b", re.IGNORECASE)
_AR = re.compile(r"(\d{1,2})\s+(" + "|".join(AR_MONTHS) + r")\s+(\d{4})")
_PERCENT = re.compile(r"(\d{1,3})\s*[%٪]")
_NO_PLAN = re.compile(
    r"(no (approved )?action plan|without an? (action )?plan|plan (is )?(missing|not (yet )?submitted)|"
    r"has(n't| not) (submitted|got) an? (action )?plan|لا توجد (لها )?خطة|بدون خطة|لم تُ?قدَّ?م (بعد )?خطة|خطة العمل (غير موجودة|مفقودة))",
    re.IGNORECASE,
)


PLAN_STATUS = {
    "submitted": {"en": "awaiting review", "ar": "بانتظار المراجعة"},
    "approved": {"en": "approved", "ar": "معتمدة"},
    "revision_required": {"en": "returned for revision", "ar": "مطلوب تعديلها"},
}


@dataclass
class Problem:
    kind: str  # unknown_reference | wrong_date | plan_missing_claim | wrong_progress
    ref: str
    detail: str


def _dates_in(text: str) -> list[datetime.date]:
    found = []
    for y, m, d in _ISO.findall(text):
        found.append((int(y), int(m), int(d)))
    for d, month, y in _EN.findall(text):
        found.append((int(y), EN_MONTHS.index(month.lower()) + 1, int(d)))
    for month, d, y in _EN_US.findall(text):
        found.append((int(y), EN_MONTHS.index(month.lower()) + 1, int(d)))
    for d, month, y in _AR.findall(text):
        found.append((int(y), AR_MONTHS.index(month) + 1, int(d)))
    out = []
    for y, m, d in found:
        try:
            out.append(datetime.date(y, m, d))
        except ValueError:
            out.append(None)
    return out


def _local(value):
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return timezone.localtime(value).date()
    return value


def plan_progress(plan) -> int:
    """Average step progress (a done step counts 100), as the case page shows it."""
    steps = list(plan.steps.all()) if plan else []
    if not steps:
        return 0
    total = sum(100 if step.is_done else max(0, min(100, step.progress_percent or 0)) for step in steps)
    return round(total / len(steps))


def case_facts(rec, user) -> dict:
    """The dates and plan facts an answer may state about one case."""
    from apps.workflow.presentation import workflow_block

    plan = getattr(rec, "action_plan", None)
    workflow = workflow_block(rec, user)
    deadline = workflow.get("deadline") or {}
    dates = {
        _local(rec.created_at),
        _local(getattr(rec, "closed_at", None)),
        plan.target_date if plan else None,
        rec.report.response_deadline,
        datetime.date.fromisoformat(deadline["date"]) if deadline.get("date") else None,
    }
    if workflow.get("original_target_date"):
        dates.add(datetime.date.fromisoformat(workflow["original_target_date"]))
    for decision in rec.verifications.all():
        dates.add(_local(decision.created_at))
        dates.add(decision.action_deadline)
    for entry in rec.trail_entries.all():
        dates.add(_local(entry.created_at))
    return {
        "ref": record_code(rec.id),
        "status": rec.status,
        "has_plan": plan is not None,
        "plan_status": plan.status if plan else None,
        "plan_progress": plan_progress(plan) if plan else None,
        "deadline": deadline.get("date"),
        "dates": {d for d in dates if d},
    }


def _segments(answer: str):
    """(ref kind, number, text up to the next reference) for each reference."""
    matches = list(REF.finditer(answer))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(answer)
        # Stop at the end of the sentence or line that names the case.
        segment = answer[match.end():end]
        cut = re.search(r"[\n.؛;](\s|$)", segment)
        yield match.group(1).upper(), int(match.group(2)), segment[: cut.start() + 1] if cut else segment


def validate_answer(user, answer: str) -> tuple[list[Problem], dict[str, dict]]:
    """Problems found, and the facts of every valid case named (by reference)."""
    from apps.audits.models import AuditReport

    from .tools import _issued, _qs

    problems: list[Problem] = []
    facts: dict[str, dict] = {}
    cases = _qs(user)
    issued = _issued(user)
    for kind, number, segment in _segments(answer):
        ref = record_code(number, kind)
        if kind == "RPT":
            if not scope_reports(AuditReport.objects.all(), user).filter(pk=number).exists():
                problems.append(Problem("unknown_reference", ref, "no such report in the user's scope"))
            continue
        rec = cases.filter(pk=number).first()
        if rec is None:
            problems.append(Problem("unknown_reference", ref, "no such recommendation in the user's scope"))
            continue
        if ref not in facts:
            facts[ref] = case_facts(rec, user)
            facts[ref]["issued"] = issued.filter(pk=number).exists()
        fact = facts[ref]
        for stated in _dates_in(segment):
            # Today's date is always a fair thing to state ("as of today, ...").
            if stated is None or (stated not in fact["dates"] and stated != timezone.localdate()):
                problems.append(Problem("wrong_date", ref, f"{stated or 'an invalid date'} is not a date of this case"))
        if fact["has_plan"] and _NO_PLAN.search(segment):
            problems.append(Problem(
                "plan_missing_claim", ref,
                f"the case has an action plan ({fact['plan_status']}, {fact['plan_progress']}%)",
            ))
        if fact["has_plan"] and re.search(r"(plan|progress|خطة|تقدم|إنجاز)", segment, re.IGNORECASE):
            for pct in _PERCENT.findall(segment):
                if int(pct) != fact["plan_progress"]:
                    problems.append(Problem("wrong_progress", ref, f"plan progress is {fact['plan_progress']}%, not {pct}%"))
    return problems, facts


def correction_message(problems: list[Problem], facts: dict[str, dict], lang: str) -> str:
    """What the model is told when its first answer failed the checks."""
    lines = ["Your answer contradicts the database. Rewrite it using only the tool results. Problems:"]
    for problem in problems:
        lines.append(f"- {problem.ref}: {problem.detail}.")
    for ref, fact in facts.items():
        lines.append(
            f"- Facts for {ref}: status {fact['status']}; action plan "
            + (f"{fact['plan_status']} at {fact['plan_progress']}%" if fact["has_plan"] else "none")
            + (f"; binding deadline {fact['deadline']}" if fact["deadline"] else "")
            + "."
        )
    lines.append("Never name a case or report that the tools did not return. If data is missing, say so.")
    return "\n".join(lines)


def safe_answer(facts: dict[str, dict], lang: str) -> str:
    """Only what the database says, when the model could not be trusted twice."""
    from apps.workflow.presentation import status_label

    en = lang == "en"
    head = (
        "I could not verify the answer against the system's records, so it is not shown."
        if en else "تعذّر التحقق من الإجابة مقابل سجلات المنظومة، لذلك لا تُعرض."
    )
    if not facts:
        return head + (" Please ask about a specific recommendation number." if en else " يُرجى السؤال عن رقم توصية محدد.")
    lines = [head, "Verified records:" if en else "البيانات الموثّقة:"]
    for ref, fact in facts.items():
        status = PLAN_STATUS.get(fact["plan_status"], {}).get("en" if en else "ar", fact["plan_status"])
        plan = (
            (f"action plan {status}, {fact['plan_progress']}% done" if en else f"خطة العمل {status}، أُنجز {fact['plan_progress']}٪")
            if fact["has_plan"] else ("no action plan" if en else "لا توجد خطة عمل")
        )
        deadline = fact["deadline"]
        due = (
            (f"; binding deadline {deadline}" if en else f"؛ الموعد الملزم {date_ar(deadline)}") if deadline else ""
        )
        lines.append(f"- {ref}: {status_label(fact['status'], language=lang)}; {plan}{due}")
    return "\n".join(lines)
