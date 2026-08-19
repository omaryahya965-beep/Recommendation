"""Dashboard intelligence computed from scoped querysets. Numbers are never invented."""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Max
from django.utils import timezone

from apps.ai.providers import provider_meta
from apps.ai.services.common import language_of
from apps.ai.services.risk_engine import delay_risk_score_only
from apps.audits.models import Recommendation
from apps.audits.serializers import RecommendationListSerializer
from apps.workflow.models import VerificationDecision

S = Recommendation.Status
ACTIVE_EXECUTION = (
    S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED,
    S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION,
    S.CLOSURE_REVIEW, S.PENDING_CLOSURE_COUNCIL,
)
OPEN = [s for s, _ in S.choices if s not in (S.CLOSED, S.DRAFT)]


def _items(qs, request, limit=8):
    qs = qs.select_related("report__department", "action_plan__responsible_employee")
    return RecommendationListSerializer(qs[:limit], many=True, context={"request": request}).data


def compute_insight_buckets(qs, request):
    today = timezone.localdate()
    approaching = today + timedelta(days=14)
    stale_before = timezone.now() - timedelta(days=10)

    overdue_qs = qs.filter(status__in=ACTIVE_EXECUTION, action_plan__target_date__lt=today)
    high_risk_qs = qs.filter(status__in=OPEN, risk_level=Recommendation.RiskLevel.HIGH)
    recurring_qs = qs.filter(is_recurring=True)
    revisions_qs = qs.filter(action_plan__revision_count__gte=2)
    insufficient_qs = qs.filter(
        verifications__decision=VerificationDecision.Decision.INSUFFICIENT
    ).distinct()
    approaching_qs = qs.filter(
        status__in=ACTIVE_EXECUTION,
        action_plan__target_date__gte=today,
        action_plan__target_date__lte=approaching,
    )
    stale_ids = (
        qs.filter(status__in=OPEN)
        .annotate(last_trail=Max("trail_entries__created_at"))
        .filter(last_trail__lt=stale_before)
        .values_list("id", flat=True)
    )
    # Also treat never-trailed updated_at as stale.
    never_trailed = (
        qs.filter(status__in=OPEN, trail_entries__isnull=True, updated_at__lt=stale_before)
        .values_list("id", flat=True)
    )
    stale_qs = qs.filter(id__in=list(stale_ids) + list(never_trailed)).distinct()

    likely_delayed = []
    evidence_concerns = []
    for rec in (
        qs.filter(status__in=ACTIVE_EXECUTION)
        .select_related("action_plan", "report__department")
        .prefetch_related("action_plan__steps", "evidence_files", "verifications", "trail_entries")[:200]
    ):
        estimate = delay_risk_score_only(rec)
        if estimate["delay_risk_score"] >= 70:
            likely_delayed.append(rec.pk)
        if rec.evidence_files.count() == 0 and rec.status in ACTIVE_EXECUTION:
            evidence_concerns.append(rec.pk)
        elif rec.verifications.filter(decision=VerificationDecision.Decision.INSUFFICIENT).exists():
            evidence_concerns.append(rec.pk)

    delayed_qs = qs.filter(pk__in=likely_delayed)
    evidence_qs = qs.filter(pk__in=evidence_concerns).distinct()

    dept_overdue = list(
        overdue_qs.values("report__department__name")
        .annotate(c=Count("id"))
        .order_by("-c")
    )
    dept_recurring = list(
        recurring_qs.values("report__department__name")
        .annotate(c=Count("id"))
        .order_by("-c")
    )

    return {
        "overdue": {"count": overdue_qs.count(), "items": _items(overdue_qs.order_by("action_plan__target_date"), request)},
        "high_risk": {"count": high_risk_qs.count(), "items": _items(high_risk_qs.order_by("-priority_score"), request)},
        "likely_delayed": {"count": delayed_qs.count(), "items": _items(delayed_qs, request)},
        "recurring": {"count": recurring_qs.count(), "items": _items(recurring_qs, request)},
        "repeated_revisions": {"count": revisions_qs.count(), "items": _items(revisions_qs, request)},
        "insufficient_evidence": {"count": insufficient_qs.count(), "items": _items(insufficient_qs, request)},
        "approaching_deadline": {
            "count": approaching_qs.count(),
            "items": _items(approaching_qs.order_by("action_plan__target_date"), request),
        },
        "no_recent_activity": {"count": stale_qs.count(), "items": _items(stale_qs, request)},
        "evidence_concerns": {"count": evidence_qs.count(), "items": _items(evidence_qs, request)},
        "department_overdue": [
            {"department": row["report__department__name"], "count": row["c"]} for row in dept_overdue
        ],
        "department_recurring": [
            {"department": row["report__department__name"], "count": row["c"]} for row in dept_recurring
        ],
    }


def _template_narratives(buckets: dict, language: str) -> list[str]:
    ar = language != "en"
    n = []
    o = buckets["overdue"]["count"]
    d = buckets["likely_delayed"]["count"]
    r = buckets["recurring"]["count"]
    e = buckets["evidence_concerns"]["count"]
    v = buckets["insufficient_evidence"]["count"]
    a = buckets["approaching_deadline"]["count"]
    s = buckets["no_recent_activity"]["count"]
    h = buckets["high_risk"]["count"]
    rev = buckets["repeated_revisions"]["count"]
    if ar:
        n.append(f"{o} توصية متأخرة حالياً عن الموعد المستهدف.")
        n.append(f"{d} توصية إضافية ذات تقدير مرتفع لاحتمالية التأخير.")
        n.append(f"{h} توصية مفتوحة بمستوى خطورة مرتفع.")
        n.append(f"{r} توصية مرتبطة بتكرار محتمل أو مؤكد.")
        if buckets["department_recurring"]:
            top = buckets["department_recurring"][0]
            n.append(f"أعلى تركيز للتكرارات حالياً في دائرة {top['department']} ({top['count']}).")
        if buckets["department_overdue"]:
            top = buckets["department_overdue"][0]
            n.append(f"أعلى تركيز للتأخير في دائرة {top['department']} ({top['count']}).")
        n.append(f"{v} توصية شهدت تحقق أدلة غير كافٍ.")
        n.append(f"{rev} توصية شهدت تعديلات متكررة على خطة العمل.")
        n.append(f"{a} توصية تقترب من الموعد المستهدف خلال 14 يوماً.")
        n.append(f"{s} توصية بلا نشاط مسجّل حديث.")
        n.append(f"{e} توصية عليها ملاحظات أدلة (غياب أو تحقق غير كافٍ).")
    else:
        n.append(f"{o} recommendations are currently overdue.")
        n.append(f"{d} additional recommendations have a high estimated delay risk.")
        n.append(f"{h} open recommendations are recorded as high risk.")
        n.append(f"{r} recommendations appear related to previously identified findings.")
        if buckets["department_recurring"]:
            top = buckets["department_recurring"][0]
            n.append(f"{top['department']} currently has the highest concentration of recurring findings ({top['count']}).")
        if buckets["department_overdue"]:
            top = buckets["department_overdue"][0]
            n.append(f"{top['department']} currently has the highest concentration of overdue items ({top['count']}).")
        n.append(f"{v} recommendations have insufficient-evidence verification decisions.")
        n.append(f"{rev} recommendations have repeated action-plan revisions.")
        n.append(f"{a} recommendations are approaching their deadline within 14 days.")
        n.append(f"{s} recommendations have no recent recorded activity.")
        n.append(f"{e} recommendations have evidence concerns.")
    return n


def build_dashboard_insights(qs, request, _user, language: str = "ar") -> dict:
    lang = language_of(language)
    buckets = compute_insight_buckets(qs, request)
    # Grounded counts only — an extra LLM pass was blocking the assistant page
    # for tens of seconds while adding at most three uncounted sentences.
    narratives = _template_narratives(buckets, lang)
    meta = provider_meta()
    return {
        "available": True,
        "provider": meta["provider"],
        "model": meta["model"],
        "generated_at": timezone.now().isoformat(),
        "advisory_notice": (
            "مؤشرات تقديرية مبنية على بيانات النظام. ليست قرارات إغلاق أو اعتماد."
            if lang == "ar"
            else "Estimates computed from system data. Not approval or closure decisions."
        ),
        "cards": {
            "high_risk": buckets["high_risk"],
            "likely_delayed": buckets["likely_delayed"],
            "recurring": buckets["recurring"],
            "evidence_concerns": buckets["evidence_concerns"],
        },
        "buckets": {
            k: buckets[k]
            for k in (
                "overdue", "high_risk", "likely_delayed", "recurring",
                "repeated_revisions", "insufficient_evidence",
                "approaching_deadline", "no_recent_activity", "evidence_concerns",
            )
        },
        "department_overdue": buckets["department_overdue"],
        "department_recurring": buckets["department_recurring"],
        "narratives": narratives,
        "human_decision_required": True,
    }
