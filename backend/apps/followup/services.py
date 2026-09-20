"""Follow-up reporting.

A follow-up report covers the recommendations that were **on the register
during the period**: issued on or before `period_end`, and not already closed
before `period_start`. Both bounds matter — a report for Q1 must not be
polluted by items closed in the previous year, nor by items issued afterwards.

`build_followup_snapshot` is the single source of truth; `preview_followup_report`
renders it without saving and `generate_followup_report` freezes it into a
`FollowUpReport` row so historical reports never drift when the underlying
recommendations move on.
"""
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.audits.models import AuditReport, Recommendation
from apps.audits.serializers import is_overdue
from apps.core.models import log_action

from .models import FollowUpReport


def period_queryset(municipality, period_start, period_end):
    """Recommendations on the register during [period_start, period_end]."""
    return (
        Recommendation.objects.filter(
            report__municipality=municipality,
            created_at__date__lte=period_end,
        )
        .exclude(status=Recommendation.Status.DRAFT)
        .exclude(report__status=AuditReport.Status.DRAFT)
        # Closed before the period opened -> not part of this follow-up.
        .filter(Q(closed_at__isnull=True) | Q(closed_at__date__gte=period_start))
        .select_related("report__department", "action_plan__responsible_employee")
    )


def build_followup_snapshot(municipality, period_start, period_end):
    recommendations = period_queryset(municipality, period_start, period_end)

    by_status = dict(recommendations.values_list("status").annotate(count=Count("id")))
    by_risk = dict(recommendations.values_list("risk_level").annotate(count=Count("id")))
    by_department = {
        row["report__department__name"]: row["count"]
        for row in recommendations.values("report__department__name").annotate(count=Count("id"))
    }
    by_engagement_type = dict(
        recommendations.values_list("report__engagement_type").annotate(count=Count("id"))
    )

    items = []
    overdue_count = 0
    for rec in recommendations:
        overdue = is_overdue(rec)
        if overdue:
            overdue_count += 1
        plan = getattr(rec, "action_plan", None)
        items.append(
            {
                "id": rec.id,
                "text": rec.text,
                "department": rec.report.department.name,
                "report": rec.report.title,
                "risk_level": rec.risk_level,
                "status": rec.status,
                "is_recurring": rec.is_recurring and rec.recurrence_confirmed,
                "target_date": str(plan.target_date) if plan else None,
                "responsible": plan.responsible_employee.full_name_ar if plan else None,
                "overdue": overdue,
                "engagement_type": rec.report.engagement_type,
                "closed_at": rec.closed_at.date().isoformat() if rec.closed_at else None,
            }
        )

    total = len(items)
    closed = by_status.get(Recommendation.Status.CLOSED, 0)
    return {
        "generated_at": timezone.now().isoformat(),
        "period_start": str(period_start),
        "period_end": str(period_end),
        "totals": {
            "total": total,
            "closed": closed,
            "completion_rate": round(closed / total * 100, 1) if total else 0.0,
            "overdue": overdue_count,
        },
        "by_status": by_status,
        "by_risk": by_risk,
        "by_department": by_department,
        "by_engagement_type": by_engagement_type,
        "items": items,
    }


def _clip(text, limit=140):
    raw = " ".join((text or "").split())
    if len(raw) <= limit:
        return raw
    return raw[: limit - 1].rstrip() + "…"


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


def build_followup_executive_summary(snapshot, period_start, period_end, language="ar"):
    totals = snapshot.get("totals") or {}
    items = snapshot.get("items") or []
    by_dept = snapshot.get("by_department") or {}
    focus = _focus_items(items)
    total = totals.get("total") or 0
    closed = totals.get("closed") or 0
    overdue = totals.get("overdue") or 0
    open_count = max(total - closed, 0)
    top_dept = max(by_dept, key=by_dept.get) if by_dept else None
    ar = language != "en"

    if ar:
        title = "ملخص تنفيذي لهذه المتابعة"
        if total == 0:
            text = (
                f"حتى {period_end} لا توجد توصيات صادرة (غير مسودة) في السجل لهذه المتابعة."
            )
            findings = [{"text": "السجل فارغ من التوصيات الصادرة حتى نهاية الفترة المحددة."}]
            steps = [{"text": "تأكد أن التوصيات غادرت حالة المسودة ثم أعد التوليد."}]
        else:
            text = (
                f"متابعة التوصيات القائمة حتى {period_end} (من {period_start}): "
                f"{total} توصية، أُغلق منها {closed} وبقي {open_count} قيد المتابعة، "
                f"والمتأخر {overdue}."
            )
            if top_dept:
                text += f" أكبر عدد في دائرة {top_dept}."
            if focus:
                refs = "، ".join(f"REC-{item['id']}" for item in focus)
                text += f" الأولوية للمتابعة: {refs}."
            else:
                text += " لا توجد توصيات متأخرة أو عالية الخطورة تتطلب تركيزاً إضافياً."
            findings = []
            for item in focus:
                findings.append(
                    {
                        "text": (
                            f"REC-{item['id']} — {item.get('department')}: {_clip(item.get('text'))} "
                            f"({'متأخرة' if item.get('overdue') else item.get('status')}، خطورة {item.get('risk_level')})"
                        )
                    }
                )
            if not findings:
                findings = [{"text": f"إغلاق {closed} من {total} في هذه الفترة."}]
            steps = []
            if overdue:
                steps.append({"text": f"معالجة {overdue} توصية متأخرة أولاً، بدءاً بما هو مذكور أعلاه."})
            if open_count:
                steps.append({"text": f"متابعة {open_count} توصية ما زالت مفتوحة حتى الإغلاق أو التحقق."})
            if not steps:
                steps.append({"text": "لا إجراء متابعة عاجل؛ التوصيات في هذه الفترة مغلقة."})
    else:
        title = "Executive summary for this follow-up"
        if total == 0:
            text = (
                f"As of {period_end} there are no issued (non-draft) recommendations to follow up."
            )
            findings = [{"text": "The register has no issued recommendations as of the period end."}]
            steps = [{"text": "Move recommendations out of draft, then generate again."}]
        else:
            text = (
                f"Follow-up of recommendations on the register as of {period_end} (period from {period_start}): "
                f"{total} recommendations, {closed} closed, {open_count} still open, {overdue} overdue."
            )
            if top_dept:
                text += f" Highest volume: {top_dept}."
            if focus:
                refs = ", ".join(f"REC-{item['id']}" for item in focus)
                text += f" Priority cases: {refs}."
            findings = [
                {
                    "text": (
                        f"REC-{item['id']} — {item.get('department')}: {_clip(item.get('text'))} "
                        f"({('overdue' if item.get('overdue') else item.get('status'))}, {item.get('risk_level')} risk)"
                    )
                }
                for item in focus
            ] or [{"text": f"{closed} of {total} closed in this period."}]
            steps = []
            if overdue:
                steps.append({"text": f"Address {overdue} overdue recommendation(s) first."})
            if open_count:
                steps.append({"text": f"Follow {open_count} still-open recommendation(s) through to closure."})
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
                "text": item.get("text"),
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
    """Freeze the current numbers into a persisted FollowUpReport.

    The stored snapshot is intentionally a copy, not a query: reopening this
    report next year must show what was true on the generation date, even
    after the underlying recommendations have moved on.
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
        total=snapshot["totals"]["total"],
    )
    return report
