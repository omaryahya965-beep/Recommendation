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
from apps.audits.models import OVERDUE_ACTIVE_STATUSES, Recommendation
from apps.audits.serializers import RecommendationListSerializer
from apps.core.analytics import cached_analytics
from apps.core.dashboard import BUILDERS, nav_counts
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


class DashboardView(APIView):
    """The signed-in user's role home (see apps.core.dashboard)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        builder = BUILDERS.get(request.user.role)
        if builder is None:
            return Response({"detail": "No dashboard for this role.", "code": "permission_denied"}, status=403)
        issued = annotate_workflow(
            scope_recommendations(
                Recommendation.objects.select_related(
                    "report__department", "action_plan__responsible_employee"
                ),
                request.user,
            ).exclude(status=S.DRAFT)
        )
        return Response(builder(request, issued, timezone.localdate()))


class NavCountsView(APIView):
    """Badge counts for the navigation (counts only, cheap enough to poll)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scoped = scope_recommendations(Recommendation.objects.all(), request.user)
        return Response(nav_counts(request.user, scoped))


def _completion_rate(completed, open_count):
    """Whole percent of assigned cases closed, rounded down: never 100 while one is open."""
    total = completed + open_count
    if not total:
        return 0
    return (completed * 100) // total


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
        # Completion from real statuses (round 2, 2.2): closed cases against all
        # cases assigned to the employee. Work submitted or under review is
        # still open, so the rate can only reach 100% when nothing is open.
        completed = {
            row["action_plan__responsible_employee"]: row["c"]
            for row in scope_recommendations(
                Recommendation.objects.filter(
                    report__department=department, action_plan__isnull=False, status=S.CLOSED
                ),
                user,
            ).values("action_plan__responsible_employee").annotate(c=Count("id"))
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
                "completed": completed.get(employee.id, 0),
                "completion_rate": _completion_rate(completed.get(employee.id, 0), row.get("open", 0)),
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
