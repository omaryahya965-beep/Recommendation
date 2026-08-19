"""Role-specific dashboard.

The Action Center lists what requires action NOW for the current user, ahead
of any statistics. Every number is computed from the live database.
"""
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.views import View
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.audits.serializers import RecommendationListSerializer
from apps.core.permissions import scope_recommendations

class HealthView(View):
    """Cheap liveness probe: no DB, no DRF, no Spectacular."""

    def get(self, request):
        return JsonResponse({"ok": True})


S = Recommendation.Status

ACTIVE_EXECUTION = (
    S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED,
    S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION,
    S.CLOSURE_REVIEW, S.PENDING_CLOSURE_COUNCIL,
)
OPEN_STATUSES = [s for s, _ in S.choices if s not in (S.CLOSED, S.DRAFT)]


def _serialize(queryset, request, limit=10):
    return RecommendationListSerializer(
        queryset[:limit], many=True, context={"request": request}
    ).data


def _overdue_qs(queryset):
    return queryset.filter(
        status__in=ACTIVE_EXECUTION,
        action_plan__target_date__lt=timezone.localdate(),
    )


def _stats(queryset):
    total_open = queryset.filter(status__in=OPEN_STATUSES).count()
    closed = queryset.filter(status=S.CLOSED).count()
    total = total_open + closed
    return {
        "total": total,
        "open": total_open,
        "closed": closed,
        "completion_rate": round(closed / total * 100, 1) if total else 0.0,
        "overdue": _overdue_qs(queryset).count(),
        "by_status": dict(queryset.values_list("status").annotate(c=Count("id"))),
        "by_risk": dict(
            queryset.filter(status__in=OPEN_STATUSES)
            .values_list("risk_level").annotate(c=Count("id"))
        ),
    }


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        base = scope_recommendations(
            Recommendation.objects.select_related(
                "report__department", "action_plan__responsible_employee"
            ),
            user,
        ).exclude(status=S.DRAFT)

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
        overdue = _overdue_qs(qs).order_by("action_plan__target_date")
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
        overdue = _overdue_qs(qs).order_by("action_plan__target_date")

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
        overdue = _overdue_qs(qs).order_by("action_plan__target_date")
        upcoming = qs.filter(
            status__in=(S.IN_PROGRESS, S.PARTIAL, S.RETURNED_INSUFFICIENT, S.REOPENED),
            action_plan__target_date__gte=today,
        ).order_by("action_plan__target_date")

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
        pending_reports = AuditReport.objects.filter(
            municipality=request.user.municipality,
            status=AuditReport.Status.PENDING_COUNCIL,
        ).select_related("department")

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
                            "recommendations_count": r.recommendations.count(),
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
