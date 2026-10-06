"""Follow-up reporting.

A follow-up report describes the register **as it stood at the end of the
period** (the "as of" moment, clamped to now). A recommendation belongs to
the period if it had been issued to its department by the end of the period
and had not been closed before the period began. Its status, deadline and
overdue state are reconstructed for that moment from the audit trail (see
`as_of.py`), never read from today's data: a March report keeps saying what
was true on 31 March.

`build_followup_snapshot` is the single source of truth; `preview_followup_report`
renders it without saving and `generate_followup_report` freezes it into a
`FollowUpReport` row so the record never drifts afterwards.

Snapshot methodology versions:
  1 (before Raqeeb V2) statuses and overdue as they were at generation time.
  2 statuses, deadlines and overdue as of the period end.
"""
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median

from django.db import transaction
from django.utils import timezone

from apps.audits.finding import brief_excerpt, case_title
from apps.audits.models import AuditReport, Recommendation
from apps.core.arabic import date_ar, recommendations
from apps.core.models import log_action
from apps.workflow.presentation import stage_index, stage_of, status_label

from .as_of import annotate_as_of, case_as_of, period_bounds
from .models import FollowUpReport

S = Recommendation.Status
METHODOLOGY_VERSION = 2

# Stages from which the department is implementing an agreed plan.
_PLAN_STAGE_INDEX = stage_index(S.ACTION_PLAN_REQUIRED)


def _candidates(municipality):
    """Every recommendation that could have been on the register: issued
    reports only, current drafts excluded (draft is never re-entered)."""
    return (
        Recommendation.objects.filter(report__municipality=municipality)
        .exclude(status=S.DRAFT)
        .exclude(report__status=AuditReport.Status.DRAFT)
        .select_related("report__department", "action_plan__responsible_employee")
        .order_by("id")
    )


def _iso(value):
    """A date as YYYY-MM-DD; a datetime as its local calendar date."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return timezone.localtime(value).date().isoformat()
    return value.isoformat()


def _rate(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


def build_followup_snapshot(municipality, period_start, period_end):
    period_start_at, as_of = period_bounds(period_start, period_end)
    as_of_date = timezone.localtime(as_of).date()
    rows = annotate_as_of(_candidates(municipality), period_start_at, as_of)

    items = []
    for rec in rows:
        state = case_as_of(rec, period_start_at, as_of)
        if state is None:
            continue
        plan = getattr(rec, "action_plan", None)
        status = state["status"]
        items.append({
            "id": rec.id,
            "reference": f"REC-{rec.id}",
            "title": case_title(rec.text),
            "excerpt": brief_excerpt(rec.text, 220),
            "department": rec.report.department.name,
            "department_id": rec.report.department_id,
            "report": rec.report.title,
            "report_id": rec.report_id,
            "engagement_type": rec.report.engagement_type,
            "risk_level": rec.risk_level,
            "status": status,
            "status_label": status_label(status, state["resolution"]),
            "stage": stage_of(status),
            "status_now": rec.status,
            "is_recurring": rec.is_recurring and rec.recurrence_confirmed,
            "responsible": plan.responsible_employee.full_name_ar if plan else None,
            "target_date": _iso(state["plan_target"]),
            "deadline": _iso(state["deadline"]),
            "deadline_source": state["deadline_source"],
            "overdue": state["overdue"],
            "days_overdue": state["days_overdue"],
            "became_overdue": state["became_overdue"],
            "response_overdue": state["response_overdue"],
            "late_in_review": state["late_in_review"],
            "issued_at": _iso(state["issued_at"]),
            "issued_in_period": state["issued_in_period"],
            "open_at_start": state["open_at_start"],
            "closed_at": _iso(state["closed_at"]),
            "closed_in_period": state["closed_in_period"],
            "resolution": state["resolution"],
            "history_incomplete": state["history_incomplete"],
        })

    closed_items = [item for item in items if item["status"] == S.CLOSED]
    open_items = [item for item in items if item["status"] != S.CLOSED]
    closed_in_period = [item for item in items if item["closed_in_period"]]
    overdue_items = [item for item in items if item["overdue"]]
    with_deadline = [item for item in open_items if item["deadline_source"] in ("plan", "verification")]

    totals = {
        "total": len(items),
        "open_at_start": sum(1 for item in items if item["open_at_start"]),
        "issued_in_period": sum(1 for item in items if item["issued_in_period"]),
        "closed_in_period": len(closed_in_period),
        "closed_implemented_in_period": sum(
            1 for item in closed_in_period if item["resolution"] == Recommendation.Resolution.IMPLEMENTED
        ),
        "closed_disagreement_in_period": sum(
            1 for item in closed_in_period
            if item["resolution"] == Recommendation.Resolution.DISAGREEMENT_ACCEPTED
        ),
        "open_at_end": len(open_items),
        "closed": len(closed_items),
        "completion_rate": _rate(len(closed_items), len(items)),
        "overdue": len(overdue_items),
        "overdue_rate": _rate(len(overdue_items), len(with_deadline)),
        "became_overdue_in_period": sum(1 for item in items if item["became_overdue"]),
        "late_in_review": sum(1 for item in items if item["late_in_review"]),
        "response_overdue": sum(1 for item in items if item["response_overdue"]),
        "high_risk_open": sum(1 for item in open_items if item["risk_level"] == Recommendation.RiskLevel.HIGH),
        "history_incomplete": sum(1 for item in items if item["history_incomplete"]),
    }

    departments = defaultdict(list)
    for item in items:
        departments[(item["department_id"], item["department"])].append(item)
    department_rows = []
    for (department_id, name), group in departments.items():
        dept_open = [item for item in group if item["status"] != S.CLOSED]
        dept_overdue = [item for item in group if item["overdue"]]
        dept_deadline = [item for item in dept_open if item["deadline_source"] in ("plan", "verification")]
        implementing = [
            item for item in group
            if item["resolution"] != Recommendation.Resolution.DISAGREEMENT_ACCEPTED
            and stage_index(item["status"]) >= _PLAN_STAGE_INDEX
        ]
        implemented = [
            item for item in group if item["resolution"] == Recommendation.Resolution.IMPLEMENTED
        ]
        department_rows.append({
            "department": department_id,
            "name": name,
            "total": len(group),
            "open": len(dept_open),
            "closed_in_period": sum(1 for item in group if item["closed_in_period"]),
            "overdue": len(dept_overdue),
            "overdue_rate": _rate(len(dept_overdue), len(dept_deadline)),
            "median_days_overdue": (
                median(item["days_overdue"] for item in dept_overdue) if dept_overdue else 0
            ),
            "execution_rate": _rate(len(implemented), len(implementing)),
            "high_risk_open": sum(1 for item in dept_open if item["risk_level"] == Recommendation.RiskLevel.HIGH),
        })
    department_rows.sort(key=lambda row: (-row["overdue"], -row["open"], row["name"]))

    major_risks = sorted(
        (item for item in open_items if item["risk_level"] == Recommendation.RiskLevel.HIGH),
        key=lambda item: (not item["overdue"], -(item["days_overdue"] or 0), item["issued_at"] or ""),
    )

    return {
        "methodology_version": METHODOLOGY_VERSION,
        "generated_at": timezone.now().isoformat(),
        "as_of": as_of.isoformat(),
        "as_of_date": as_of_date.isoformat(),
        "period_start": str(period_start),
        "period_end": str(period_end),
        "totals": totals,
        "by_status": dict(Counter(item["status"] for item in items)),
        "by_stage": dict(Counter(item["stage"] for item in items)),
        "by_risk": dict(Counter(item["risk_level"] for item in open_items)),
        # v1 shape (name -> count), kept for older readers of the snapshot.
        "by_department": {row["name"]: row["total"] for row in department_rows},
        "departments": department_rows,
        "by_engagement_type": dict(Counter(item["engagement_type"] for item in items)),
        "major_risks": [item["id"] for item in major_risks[:10]],
        "items": items,
    }


def _clip(text, limit=140):
    raw = " ".join((text or "").split())
    if len(raw) <= limit:
        return raw
    return raw[: limit - 1].rstrip() + "…"


_RISK_AR = {"high": "عالية", "medium": "متوسطة", "low": "منخفضة"}


def _item_title(item):
    """v2 items carry a title; v1 items only the full text."""
    return item.get("title") or _clip(item.get("text"))


def _focus_items(items):
    closed = Recommendation.Status.CLOSED
    ranked = []
    for item in items:
        score = 0
        if item.get("overdue"):
            score += 40
        if item.get("risk_level") == Recommendation.RiskLevel.HIGH:
            score += 25
        if item.get("status") != closed:
            score += 15
        if item.get("is_recurring"):
            score += 10
        ranked.append((score, item))
    ranked.sort(key=lambda row: (-row[0], row[1].get("id") or 0))
    return [item for score, item in ranked if score > 0][:5]


def _plural_en(n):
    return "recommendation" if n == 1 else "recommendations"


def build_followup_executive_summary(snapshot, period_start, period_end, language="ar"):
    totals = snapshot.get("totals") or {}
    items = snapshot.get("items") or []
    by_dept = snapshot.get("by_department") or {}
    focus = _focus_items(items)
    total = totals.get("total") or 0
    closed = totals.get("closed") or 0
    overdue = totals.get("overdue") or 0
    closed_in_period = totals.get("closed_in_period")
    late_in_review = totals.get("late_in_review") or 0
    open_count = max(total - closed, 0)
    top_dept = max(by_dept, key=by_dept.get) if by_dept else None
    as_of = snapshot.get("as_of_date") or str(period_end)
    ar = language != "en"

    if ar:
        title = "ملخص تنفيذي لهذه المتابعة"
        if total == 0:
            text = f"حتى {date_ar(as_of)} لا توجد توصيات صادرة (غير مسودة) في السجل لهذه المتابعة."
            findings = [{"text": "السجل فارغ من التوصيات الصادرة حتى نهاية الفترة المحددة."}]
            steps = [{"text": "تأكد أن التوصيات غادرت حالة المسودة ثم أعد التوليد."}]
        else:
            text = (
                f"حال السجل كما كان في {date_ar(as_of)} (الفترة من {date_ar(period_start)}): "
                f"{recommendations(total)}، أُغلق منها {closed} وبقي {open_count} مفتوحة، والمتأخر على الدوائر {overdue}."
            )
            if closed_in_period is not None:
                text += f" أُغلق خلال الفترة {closed_in_period}."
            if late_in_review:
                text += f" وتجاوز {late_in_review} موعده أثناء انتظار الرقابة أو المجلس (لا يُحسب تأخراً على الدائرة)."
            if top_dept:
                text += f" أكبر عدد في دائرة {top_dept}."
            if focus:
                refs = "، ".join(f"REC-{item['id']}" for item in focus)
                text += f" الأولوية للمتابعة: {refs}."
            else:
                text += " لا توجد توصيات متأخرة أو عالية الخطورة تتطلب تركيزاً إضافياً."
            findings = []
            for item in focus:
                state = "متأخرة" if item.get("overdue") else (item.get("status_label") or item.get("status"))
                findings.append(
                    {
                        "text": (
                            f"REC-{item['id']} — {item.get('department')}: {_item_title(item)} "
                            f"({state}، خطورة {_RISK_AR.get(item.get('risk_level'), item.get('risk_level'))})"
                        )
                    }
                )
            if not findings:
                findings = [{"text": f"إغلاق {closed} من {total} حتى نهاية الفترة."}]
            steps = []
            if overdue:
                steps.append({"text": f"معالجة {recommendations(overdue)} متأخرة أولاً، بدءاً بما هو مذكور أعلاه."})
            if open_count:
                steps.append({"text": f"متابعة {recommendations(open_count)} ما زالت مفتوحة حتى الإغلاق أو التحقق."})
            if not steps:
                steps.append({"text": "لا إجراء متابعة عاجل؛ التوصيات في هذه الفترة مغلقة."})
    else:
        title = "Executive summary for this follow-up"
        if total == 0:
            text = f"As of {as_of} there are no issued (non-draft) recommendations to follow up."
            findings = [{"text": "The register has no issued recommendations as of the period end."}]
            steps = [{"text": "Move recommendations out of draft, then generate again."}]
        else:
            text = (
                f"The register as it stood on {as_of} (period from {period_start}): "
                f"{total} {_plural_en(total)}, {closed} closed, {open_count} open, "
                f"{overdue} overdue with the departments."
            )
            if closed_in_period is not None:
                text += f" {closed_in_period} closed during the period."
            if late_in_review:
                text += (
                    f" {late_in_review} passed their date while waiting on audit or the council "
                    "(not counted as department delay)."
                )
            if top_dept:
                text += f" Highest volume: {top_dept}."
            if focus:
                refs = ", ".join(f"REC-{item['id']}" for item in focus)
                text += f" Priority cases: {refs}."
            findings = [
                {
                    "text": (
                        f"REC-{item['id']} — {item.get('department')}: {_item_title(item)} "
                        f"({('overdue' if item.get('overdue') else item.get('status'))}, {item.get('risk_level')} risk)"
                    )
                }
                for item in focus
            ] or [{"text": f"{closed} of {total} closed by the end of the period."}]
            steps = []
            if overdue:
                steps.append({"text": f"Address {overdue} overdue {_plural_en(overdue)} first."})
            if open_count:
                steps.append({"text": f"Follow {open_count} still-open {_plural_en(open_count)} through to closure."})
            if not steps:
                steps.append({"text": "No urgent follow-up; recommendations in this period are closed."})

    return {
        "title": title,
        "text": text,
        "key_findings": findings,
        "recommended_next_steps": steps,
        "focus": [
            {
                "id": item["id"],
                "department": item.get("department"),
                "status": item.get("status"),
                "risk_level": item.get("risk_level"),
                "overdue": item.get("overdue"),
                "text": _item_title(item),
            }
            for item in focus
        ],
    }


def preview_followup_report(municipality, period_start, period_end, language="ar"):
    """Compute the report without saving. Used for the on-screen preview."""
    snapshot = build_followup_snapshot(municipality, period_start, period_end)
    return {
        "period_start": period_start,
        "period_end": period_end,
        "snapshot": snapshot,
        "executive_summary": build_followup_executive_summary(
            snapshot, period_start, period_end, language
        ),
    }


@transaction.atomic
def generate_followup_report(municipality, user, period_start, period_end, language="ar"):
    """Freeze the as-of picture into a persisted FollowUpReport.

    The stored snapshot is a copy, not a query: reopening this report next
    year shows exactly what it showed when it was generated.
    """
    snapshot = build_followup_snapshot(municipality, period_start, period_end)
    summary = build_followup_executive_summary(
        snapshot, period_start, period_end, language
    )
    report = FollowUpReport.objects.create(
        municipality=municipality,
        period_start=period_start,
        period_end=period_end,
        generated_by=user,
        snapshot=snapshot,
        executive_summary=summary,
        language=language if language in ("ar", "en") else "ar",
    )
    log_action(
        user,
        "followup_report_generated",
        followup_report_id=report.id,
        period_start=str(period_start),
        period_end=str(period_end),
        as_of=snapshot["as_of"],
        total=snapshot["totals"]["total"],
    )
    return report
