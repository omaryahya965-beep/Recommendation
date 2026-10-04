"""Server-side filtering for the recommendation register.

`overdue` used to be applied in the browser over one page of results, which
made the count, the pagination and the dashboard links disagree with each
other. It is evaluated in SQL here instead, from the same status list the
serializer and dashboard use.
"""
from django.db.models import Case, F, IntegerField, Value, When
from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework.filters import OrderingFilter

from .models import OPEN_STATUSES, OVERDUE_ACTIVE_STATUSES, AuditReport, Recommendation

# Severity as a number, so "sort by risk" means high -> medium -> low rather
# than the alphabetical high -> low -> medium the raw column gives.
RISK_RANK = Case(
    When(risk_level=Recommendation.RiskLevel.HIGH, then=Value(3)),
    When(risk_level=Recommendation.RiskLevel.MEDIUM, then=Value(2)),
    When(risk_level=Recommendation.RiskLevel.LOW, then=Value(1)),
    default=Value(0),
    output_field=IntegerField(),
)


class RecommendationOrderingFilter(OrderingFilter):
    """`?ordering=` for the register and its CSV export.

    Public names stay stable while the SQL behind them is corrected:
    `risk_level`/`risk` order by severity, `target_date`/`deadline` by the
    action-plan deadline with undated cases last. A deterministic tie-break
    is always appended so pagination never shows a row twice.
    """

    ALIASES = {
        "risk_level": "risk_rank",
        "risk": "risk_rank",
        "target_date": "action_plan__target_date",
        "deadline": "action_plan__target_date",
    }
    TIEBREAK = ("-priority_score", "-created_at", "-id")

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if not ordering:
            return queryset

        expressions = []
        used = set()
        for term in ordering:
            descending = term.startswith("-")
            name = self.ALIASES.get(term.lstrip("-"), term.lstrip("-"))
            if name in used:
                continue
            used.add(name)
            if name == "risk_rank" and "risk_rank" not in queryset.query.annotations:
                queryset = queryset.annotate(risk_rank=RISK_RANK)
            field = F(name)
            expressions.append(
                field.desc(nulls_last=True) if descending else field.asc(nulls_last=True)
            )
        for tie in self.TIEBREAK:
            name = tie.lstrip("-")
            if name not in used:
                used.add(name)
                expressions.append(F(name).desc() if tie.startswith("-") else F(name).asc())
        return queryset.order_by(*expressions)


class RecommendationFilterSet(filters.FilterSet):
    status = filters.CharFilter(field_name="status", lookup_expr="exact")
    status__in = filters.BaseInFilter(field_name="status", lookup_expr="in")
    risk_level = filters.CharFilter(field_name="risk_level", lookup_expr="exact")
    report = filters.NumberFilter(field_name="report_id")
    report__department = filters.NumberFilter(field_name="report__department_id")
    engagement_type = filters.ChoiceFilter(
        field_name="report__engagement_type",
        choices=AuditReport.EngagementType.choices,
    )
    is_recurring = filters.BooleanFilter(field_name="is_recurring")
    recurrence_confirmed = filters.BooleanFilter(field_name="recurrence_confirmed")
    overdue = filters.BooleanFilter(method="filter_overdue")
    open = filters.BooleanFilter(method="filter_open")
    responsible_employee = filters.NumberFilter(
        field_name="action_plan__responsible_employee_id"
    )

    class Meta:
        model = Recommendation
        fields = [
            "status",
            "risk_level",
            "report",
            "report__department",
            "engagement_type",
            "is_recurring",
            "recurrence_confirmed",
            "overdue",
            "open",
            "responsible_employee",
        ]

    def filter_overdue(self, queryset, name, value):
        if value is None:
            return queryset
        condition = {
            "status__in": OVERDUE_ACTIVE_STATUSES,
            "action_plan__target_date__lt": timezone.localdate(),
        }
        if value:
            return queryset.filter(**condition)
        return queryset.exclude(**condition)

    def filter_open(self, queryset, name, value):
        if value is None:
            return queryset
        if value:
            return queryset.filter(status__in=OPEN_STATUSES)
        return queryset.exclude(status__in=OPEN_STATUSES)
