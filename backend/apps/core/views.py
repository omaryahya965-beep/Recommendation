"""Role-specific dashboard.

The Action Center lists what requires action NOW for the current user, ahead
of any statistics. Every number is computed from the live database.
"""
from django.db.models import Count, F
from django.http import JsonResponse
from django.utils import timezone
from django.views import View
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audits.models import (
    OPEN_STATUSES,
    OVERDUE_ACTIVE_STATUSES,
    AuditReport,
    Recommendation,
)
from apps.audits.serializers import RecommendationListSerializer
from apps.core.analytics import cached_analytics, portfolio_totals
from apps.core.permissions import scope_recommendations
from apps.workflow.presentation import annotate_workflow, overdue_q

class HealthView(View):
    """Cheap liveness probe: no DB, no DRF, no Spectacular."""

    def get(self, request):
        return JsonResponse({"ok": True})


class AnalyticsView(APIView):
    """Aggregated portfolio analytics, computed in SQL.

    The browser used to page the whole register in to compute these numbers.
    Scoping is identical to every other list endpoint.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            months = max(1, min(36, int(request.query_params.get("months", 12))))
        except (TypeError, ValueError):
            months = 12
        return Response(cached_analytics(request.user, months=months))


S = Recommendation.Status

# Shared with the `overdue` API filter and the serializer badge so the
# dashboard KPI, the filtered list and the row badge always agree.
ACTIVE_EXECUTION = OVERDUE_ACTIVE_STATUSES


def _serialize(queryset, request, limit=10):
    return RecommendationListSerializer(
        queryset[:limit], many=True, context={"request": request}
    ).data


def _overdue_qs(queryset):
    """Department overdue (binding deadline passed while the department owns
    the action), the same rule as the register filter and the row badge."""
    return annotate_workflow(queryset).filter(overdue_q())


def _stats(queryset):
    """The dashboard KPIs: the same function and definitions as
    /api/analytics/ (apps.core.analytics.portfolio_totals), so a dashboard
    tile and the analytics page can never disagree."""
    totals = portfolio_totals(queryset.exclude(status=S.DRAFT))
    return {
        **totals,
        "by_status": dict(queryset.exclude(status=S.DRAFT).values_list("status").annotate(c=Count("id"))),
        "by_risk": dict(
            queryset.filter(status__in=OPEN_STATUSES)
            .values_list("risk_level").annotate(c=Count("id"))
        ),
    }


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        base = annotate_workflow(
            scope_recommendations(
                Recommendation.objects.select_related(
                    "report__department", "action_plan__responsible_employee"
                ),
                user,
            ).exclude(status=S.DRAFT)
        )

        handler = {
            User.Role.AUDIT: self._audit,
            User.Role.DEPARTMENT_HEAD: self._department_head,
            User.Role.EMPLOYEE: self._employee,
            User.Role.COUNCIL: self._council,
        }.get(user.role)
        if handler is None:
            return Response({"detail": "No dashboard for this role."}, status=403)
        return Response(handler(request, base))

    # ------------------------------------------------------------------
    def _audit(self, request, qs):
        pending_review = qs.filter(status=S.AUDIT_REVIEW).order_by("-priority_score")
        plans_to_review = qs.filter(status=S.ACTION_PLAN_REVIEW).order_by("-priority_score")
        verifications = qs.filter(status=S.SUBMITTED_FOR_VERIFICATION).order_by("-priority_score")
        closures = qs.filter(status=S.CLOSURE_REVIEW).order_by("-priority_score")
        overdue = _overdue_qs(qs).order_by("binding_deadline", "-priority_score")
        recurring_unconfirmed = qs.filter(is_recurring=True, recurrence_confirmed=False)

        return {
            "role": "audit",
            "action_center": {
                "responses_to_review": {
                    "count": pending_review.count(),
                    "items": _serialize(pending_review, request),
                },
                "plans_to_review": {
                    "count": plans_to_review.count(),
                    "items": _serialize(plans_to_review, request),
                },
                "verifications_pending": {
                    "count": verifications.count(),
                    "items": _serialize(verifications, request),
                },
                "closure_reviews": {
                    "count": closures.count(),
                    "items": _serialize(closures, request),
                },
                "overdue": {
                    "count": overdue.count(),
                    "items": _serialize(overdue, request),
                },
                "possible_recurrences": {
                    "count": recurring_unconfirmed.count(),
                    "items": _serialize(recurring_unconfirmed, request),
                },
            },
            "stats": _stats(qs),
        }

    def _department_head(self, request, qs):
        responses_needed = qs.filter(
            status__in=(S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION)
        ).order_by("-priority_score")
        plans_needed = qs.filter(
            status__in=(S.ACTION_PLAN_REQUIRED, S.REVISION_REQUIRED)
        ).order_by("-priority_score")
        implementations_to_review = qs.filter(status=S.PENDING_HEAD_REVIEW).order_by("-priority_score")
        in_execution = qs.filter(status__in=ACTIVE_EXECUTION)
        overdue = _overdue_qs(qs).order_by("binding_deadline", "-priority_score")

        return {
            "role": "department_head",
            "action_center": {
                "responses_needed": {
                    "count": responses_needed.count(),
                    "items": _serialize(responses_needed, request),
                },
                "plans_needed": {
                    "count": plans_needed.count(),
                    "items": _serialize(plans_needed, request),
                },
                "implementations_to_review": {
                    "count": implementations_to_review.count(),
                    "items": _serialize(implementations_to_review, request),
                },
                "overdue": {
                    "count": overdue.count(),
                    "items": _serialize(overdue, request),
                },
            },
            "in_execution": {
                "count": in_execution.count(),
                "items": _serialize(in_execution, request),
            },
            "stats": _stats(qs),
        }

    def _employee(self, request, qs):
        today = timezone.localdate()
        returned = qs.filter(status__in=(S.RETURNED_INSUFFICIENT, S.REOPENED))
        waiting_head = qs.filter(status=S.PENDING_HEAD_REVIEW)
        active = qs.filter(status__in=(S.IN_PROGRESS, S.PARTIAL, S.REOPENED))
        overdue = _overdue_qs(qs).order_by("binding_deadline", "-priority_score")
        upcoming = qs.filter(
            status__in=(S.IN_PROGRESS, S.PARTIAL, S.RETURNED_INSUFFICIENT, S.REOPENED),
            action_plan__target_date__gte=today,
        ).order_by("binding_deadline", "-priority_score")

        return {
            "role": "employee",
            "action_center": {
                "returned_for_more_evidence": {
                    "count": returned.count(),
                    "items": _serialize(returned, request),
                },
                "waiting_head_review": {
                    "count": waiting_head.count(),
                    "items": _serialize(waiting_head, request),
                },
                "overdue": {
                    "count": overdue.count(),
                    "items": _serialize(overdue, request),
                },
                "upcoming_deadlines": {
                    "count": upcoming.count(),
                    "items": _serialize(upcoming, request),
                },
            },
            "active_tasks": {
                "count": active.count(),
                "items": _serialize(active, request),
            },
            "stats": _stats(qs),
        }

    def _council(self, request, qs):
        pending_reports = (
            AuditReport.objects.filter(
                municipality=request.user.municipality,
                status=AuditReport.Status.PENDING_COUNCIL,
            )
            .select_related("department")
            # One grouped query instead of a COUNT per report.
            .annotate(recommendations_total=Count("recommendations"))
            .order_by("updated_at", "id")
        )

        pending_closures = qs.filter(status=S.PENDING_CLOSURE_COUNCIL).order_by("-priority_score")

        return {
            "role": "council",
            "action_center": {
                "reports_pending_ratification": {
                    "count": pending_reports.count(),
                    "items": [
                        {
                            "id": r.id,
                            "title": r.title,
                            "department_name": r.department.name,
                            "engagement_type": r.engagement_type,
                            "recommendations_count": r.recommendations_total,
                            "created_at": r.created_at,
                        }
                        for r in pending_reports[:10]
                    ],
                },
                "closures_pending": {
                    "count": pending_closures.count(),
                    "items": _serialize(pending_closures, request),
                },
            },
            "stats": _stats(qs),
        }


class TeamWorkloadView(APIView):
    """Per-employee workload for one department, computed in SQL.

    Replaces a page that loaded at most 100 recommendations and grouped them
    in the browser, silently dropping the rest. Counts are exact; each
    employee also carries their next cases by deadline (`limit`), with the
    full list one register link away (?responsible_employee=<id>).

    Department heads see their own department; internal audit may pass
    ?department=<id>.
    """

    permission_classes = [IsAuthenticated]
    ITEM_LIMIT = 10

    def get(self, request):
        from datetime import timedelta

        from django.db.models import Min, Q

        from apps.audits.models import AUDIT_QUEUE_STATUSES, COUNCIL_QUEUE_STATUSES
        from apps.core.analytics import IN_EXECUTION_STATUSES
        from apps.organizations.models import Department

        user = request.user
        if user.role == User.Role.DEPARTMENT_HEAD:
            department_id = user.department_id
        elif user.role == User.Role.AUDIT:
            try:
                department_id = int(request.query_params.get("department", ""))
            except ValueError:
                return Response({"detail": "department is required.", "code": "validation_error"}, status=400)
        else:
            return Response({"detail": "Not allowed.", "code": "permission_denied"}, status=403)
        department = Department.objects.filter(pk=department_id, municipality=user.municipality).first()
        if department is None:
            return Response({"detail": "Not found.", "code": "not_found"}, status=404)

        today = timezone.localdate()
        cases = annotate_workflow(
            scope_recommendations(
                Recommendation.objects.filter(report__department=department, action_plan__isnull=False)
                .exclude(status=S.CLOSED)
                .select_related("report__department", "action_plan__responsible_employee"),
                user,
            )
        )
        department_q = Q(status__in=OVERDUE_ACTIVE_STATUSES)
        rows = {
            row["action_plan__responsible_employee"]: row
            for row in cases.values("action_plan__responsible_employee").annotate(
                open=Count("id"),
                active=Count("id", filter=Q(status__in=IN_EXECUTION_STATUSES)),
                overdue=Count("id", filter=overdue_q(today)),
                due_soon=Count(
                    "id",
                    filter=department_q
                    & Q(binding_deadline__gte=today, binding_deadline__lte=today + timedelta(days=7)),
                ),
                returned=Count("id", filter=Q(status__in=(S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED))),
                awaiting_head_review=Count("id", filter=Q(status=S.PENDING_HEAD_REVIEW)),
                in_review=Count("id", filter=Q(status__in=AUDIT_QUEUE_STATUSES + COUNCIL_QUEUE_STATUSES)),
                nearest=Min("binding_deadline", filter=department_q),
            )
        }
        employees = User.objects.filter(
            role=User.Role.EMPLOYEE, department=department, is_active=True
        ).order_by("full_name_ar", "username")
        result = []
        for employee in employees:
            row = rows.get(employee.id, {})
            items = cases.filter(action_plan__responsible_employee=employee).order_by(
                F("binding_deadline").asc(nulls_last=True), "-priority_score"
            )[: self.ITEM_LIMIT]
            result.append({
                "employee": {"id": employee.id, "name": employee.full_name_ar or employee.username},
                "open": row.get("open", 0),
                "active": row.get("active", 0),
                "overdue": row.get("overdue", 0),
                "due_soon": row.get("due_soon", 0),
                "returned": row.get("returned", 0),
                "awaiting_head_review": row.get("awaiting_head_review", 0),
                "in_review": row.get("in_review", 0),
                "nearest_deadline": row["nearest"].isoformat() if row.get("nearest") else None,
                "items": RecommendationListSerializer(items, many=True, context={"request": request}).data,
            })
        result.sort(key=lambda item: (-item["overdue"], -item["open"], item["employee"]["name"]))
        return Response({
            "department": {"id": department.id, "name": department.name},
            "generated_at": timezone.now().isoformat(),
            "item_limit": self.ITEM_LIMIT,
            "employees": result,
        })
