"""Follow-up preview: computed from live data and returned for this session only."""
from django.db.models import Count
from django.utils import timezone

from apps.audits.models import Recommendation
from apps.audits.serializers import is_overdue


def build_followup_snapshot(municipality, period_start, period_end):
    recommendations = (
        Recommendation.objects.filter(
            report__municipality=municipality,
            created_at__date__lte=period_end,
        )
        .exclude(status=Recommendation.Status.DRAFT)
        .select_related("report__department", "action_plan__responsible_employee")
    )

    by_status = dict(recommendations.values_list("status").annotate(count=Count("id")))
    by_risk = dict(recommendations.values_list("risk_level").annotate(count=Count("id")))
    by_department = {
        row["report__department__name"]: row["count"]
        for row in recommendations.values("report__department__name").annotate(count=Count("id"))
    }

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
            }
        )

    total = len(items)
    closed = by_status.get(Recommendation.Status.CLOSED, 0)
    return {
        "generated_at": timezone.now().isoformat(),
        "totals": {
            "total": total,
            "closed": closed,
            "completion_rate": round(closed / total * 100, 1) if total else 0.0,
            "overdue": overdue_count,
        },
        "by_status": by_status,
        "by_risk": by_risk,
        "by_department": by_department,
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
    snapshot = build_followup_snapshot(municipality, period_start, period_end)
    return {
        "period_start": period_start,
        "period_end": period_end,
        "snapshot": snapshot,
        "executive_summary": build_followup_executive_summary(
            snapshot, period_start, period_end, language
        ),
    }
