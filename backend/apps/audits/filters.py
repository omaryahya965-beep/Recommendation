"""Server-side filtering for the recommendation register.

`overdue` used to be applied in the browser over one page of results, which
made the count, the pagination and the dashboard links disagree with each
other. It is evaluated in SQL here instead, from the same status list the
serializer and dashboard use.
"""
from django.utils import timezone
from django_filters import rest_framework as filters

from .models import OPEN_STATUSES, OVERDUE_ACTIVE_STATUSES, AuditReport, Recommendation


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
