"""Follow-up report generation: everything is computed from live DB data."""
from django.db.models import Count
from django.utils import timezone

from apps.audits.models import Recommendation
from apps.audits.serializers import is_overdue
from apps.core.models import log_action

from .models import FollowUpReport


def generate_followup_report(municipality, user, period_start, period_end):
    recommendations = (
        Recommendation.objects.filter(
            report__municipality=municipality,
            created_at__date__lte=period_end,
        )
        .exclude(status=Recommendation.Status.DRAFT)
        .select_related("report__department", "action_plan__responsible_employee")
    )

    by_status = dict(
        recommendations.values_list("status").annotate(count=Count("id"))
    )
    by_risk = dict(
        recommendations.values_list("risk_level").annotate(count=Count("id"))
    )
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
    snapshot = {
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

    report = FollowUpReport.objects.create(
        municipality=municipality,
        period_start=period_start,
        period_end=period_end,
        generated_by=user,
        snapshot=snapshot,
    )
    log_action(
        user, "followup_report_generated",
        period_start=str(period_start), period_end=str(period_end),
        followup_id=report.id,
    )
    return report
