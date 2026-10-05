"""Server-side filtering for the recommendation register.

`overdue` used to be applied in the browser over one page of results, which
made the count, the pagination and the dashboard links disagree with each
other. It is evaluated in SQL here instead, with the same rules as the row
badge and the dashboards (apps.workflow.presentation): the binding deadline,
counted only while the department owns the next action.
"""
from datetime import timedelta

from django.db.models import Case, F, IntegerField, Q, Value, When
from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework.filters import OrderingFilter

from .models import (
    DEPARTMENT_DEADLINE_STATUSES,
    OPEN_STATUSES,
    AuditReport,
    Recommendation,
)

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
    `risk_level`/`risk` order by severity, `target_date` by the action plan's
    own date, `deadline` by the binding deadline (the row's `deadline` field:
    plan, audit-set after verification, or response) and `waiting` by the
    time the case entered its current status (`waiting` = longest first).
    Undated cases sort last. A deterministic tie-break is always appended so
    pagination never shows a row twice.
    """

    ALIASES = {
        "risk_level": "risk_rank",
        "risk": "risk_rank",
        "target_date": "action_plan__target_date",
        "deadline": "binding_deadline",
        "waiting": "status_entered_at",
    }
    WORKFLOW_ANNOTATIONS = {"binding_deadline", "status_entered_at"}
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
            if name in self.WORKFLOW_ANNOTATIONS:
                from apps.workflow.presentation import annotate_workflow

                queryset = annotate_workflow(queryset)
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
    # Business-stage views of the workflow (ten stages, not nineteen statuses).
    stage = filters.CharFilter(method="filter_stage")
    # One side or several, comma-separated (e.g. "audit,council").
    waiting_on = filters.CharFilter(method="filter_waiting_on")
    # In the current status for more than N days.
    waiting_over = filters.NumberFilter(method="filter_waiting_over")
    my_turn = filters.BooleanFilter(method="filter_my_turn")
    response_overdue = filters.BooleanFilter(method="filter_response_overdue")
    due_within = filters.NumberFilter(method="filter_due_within")

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
            "stage",
            "waiting_on",
            "waiting_over",
            "my_turn",
            "response_overdue",
            "due_within",
        ]

    def filter_overdue(self, queryset, name, value):
        from apps.workflow.presentation import annotate_workflow, overdue_q

        if value is None:
            return queryset
        queryset = annotate_workflow(queryset)
        if value:
            return queryset.filter(overdue_q())
        return queryset.exclude(overdue_q())

    def filter_stage(self, queryset, name, value):
        from apps.workflow.presentation import statuses_for_stage

        statuses = statuses_for_stage(value)
        return queryset.filter(status__in=statuses) if statuses else queryset.none()

    WAITING_SIDES = ("department", "audit", "council", "none")

    def filter_waiting_on(self, queryset, name, value):
        from rest_framework.exceptions import ValidationError

        from apps.workflow.presentation import waiting_on_q

        sides = [side.strip() for side in (value or "").split(",") if side.strip()]
        if not sides:
            return queryset
        unknown = [side for side in sides if side not in self.WAITING_SIDES]
        if unknown:
            raise ValidationError({"waiting_on": [f"Unknown side: {', '.join(unknown)}."]})
        condition = Q()
        for side in sides:
            condition |= waiting_on_q(side)
        return queryset.filter(condition)

    def filter_waiting_over(self, queryset, name, value):
        from apps.workflow.presentation import annotate_workflow, waiting_longer_than_q

        if value is None:
            return queryset
        return annotate_workflow(queryset).filter(waiting_longer_than_q(max(0, int(value))))

    def filter_my_turn(self, queryset, name, value):
        from apps.workflow.presentation import my_turn_q

        if value is None:
            return queryset
        condition = my_turn_q(self.request.user)
        return queryset.filter(condition) if value else queryset.exclude(condition)

    def filter_response_overdue(self, queryset, name, value):
        if value is None:
            return queryset
        condition = Q(
            status__in=(Recommendation.Status.PENDING_RESPONSE, Recommendation.Status.RETURNED_FOR_REVISION),
            report__response_deadline__lt=timezone.localdate(),
        )
        return queryset.filter(condition) if value else queryset.exclude(condition)

    def filter_due_within(self, queryset, name, value):
        """Department-owned cases whose binding deadline falls in the next N days."""
        from apps.workflow.presentation import annotate_workflow

        if value is None:
            return queryset
        today = timezone.localdate()
        queryset = annotate_workflow(queryset)
        return queryset.filter(
            status__in=DEPARTMENT_DEADLINE_STATUSES,
            binding_deadline__gte=today,
            binding_deadline__lte=today + timedelta(days=max(0, int(value))),
        )

    def filter_open(self, queryset, name, value):
        if value is None:
            return queryset
        if value:
            return queryset.filter(status__in=OPEN_STATUSES)
        return queryset.exclude(status__in=OPEN_STATUSES)
