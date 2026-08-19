from django.contrib.auth import get_user_model
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import WorkflowError
from apps.core.models import log_action
from apps.core.permissions import (
    IsAudit,
    IsCouncil,
    IsDepartmentHead,
    scope_recommendations,
    scope_reports,
)
from apps.workflow import services
from apps.workflow.models import ActionStep
from apps.workflow.serializers import (
    ActionPlanInputSerializer,
    EvidenceInputSerializer,
    RespondInputSerializer,
    ReviewInputSerializer,
    StepProgressInputSerializer,
    VerifyInputSerializer,
)

from .models import AuditReport, Recommendation
from .serializers import (
    AuditReportDetailSerializer,
    AuditReportSerializer,
    RecommendationCreateSerializer,
    RecommendationDetailSerializer,
    RecommendationListSerializer,
)

User = get_user_model()


class PendingApprovalsView(APIView):
    """Council: reports awaiting ratification."""

    permission_classes = [IsCouncil]

    def get(self, request):
        reports = (
            AuditReport.objects.filter(
                municipality=request.user.municipality,
                status=AuditReport.Status.PENDING_COUNCIL,
            )
            .select_related("department", "created_by", "municipality")
            .annotate(recommendations_count=Count("recommendations"))
        )
        return Response(
            AuditReportSerializer(reports, many=True, context={"request": request}).data
        )


class AuditReportViewSet(viewsets.ModelViewSet):
    """Reports: creation and lifecycle actions are audit-only; ratification
    is council-only. All list access is scoped by role."""

    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status", "department", "engagement_type"]
    search_fields = ["title"]

    def get_queryset(self):
        qs = (
            AuditReport.objects.select_related("department", "created_by", "municipality")
            .annotate(recommendations_count=Count("recommendations"))
        )
        return scope_reports(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AuditReportDetailSerializer
        return AuditReportSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "submit_to_department",
                           "submit_to_council"):
            return [IsAudit()]
        if self.action == "ratify":
            return [IsCouncil()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        report = serializer.save(
            created_by=self.request.user, municipality=self.request.user.municipality
        )
        log_action(self.request.user, "report_created", report=report, title=report.title)

    def perform_update(self, serializer):
        if serializer.instance.status != AuditReport.Status.DRAFT:
            raise WorkflowError("Only draft reports can be edited.")
        serializer.save()

    @action(detail=True, methods=["post"], url_path="submit-to-department")
    def submit_to_department(self, request, pk=None):
        report = services.submit_report_to_department(self.get_object(), request.user)
        return Response(AuditReportSerializer(report, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="submit-to-council")
    def submit_to_council(self, request, pk=None):
        report = services.submit_report_to_council(self.get_object(), request.user)
        return Response(AuditReportSerializer(report, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def ratify(self, request, pk=None):
        report = services.ratify_report(
            self.get_object(), request.user, notes=request.data.get("notes", "")
        )
        return Response(AuditReportSerializer(report, context={"request": request}).data)


class RecommendationViewSet(viewsets.ModelViewSet):
    """Recommendations and every workflow action on them. Status is never
    writable directly — each action maps to a validated service call."""

    http_method_names = ["get", "post", "patch", "head", "options"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = {
        "status": ["exact", "in"],
        "risk_level": ["exact"],
        "report": ["exact"],
        "report__department": ["exact"],
        "is_recurring": ["exact"],
    }
    search_fields = ["text", "root_cause"]
    ordering_fields = ["priority_score", "created_at", "risk_level"]

    def get_queryset(self):
        qs = Recommendation.objects.select_related(
            "report__department", "report__municipality",
            "action_plan__responsible_employee", "response", "similar_recommendation",
        ).prefetch_related("action_plan__steps")
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                "approvals__approved_by", "evidence_files__uploaded_by",
                "verifications__reviewed_by", "trail_entries__user",
            )
        return scope_recommendations(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return RecommendationCreateSerializer
        if self.action == "retrieve":
            return RecommendationDetailSerializer
        return RecommendationListSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "review",
                           "review_plan", "verify", "confirm_recurrence",
                           "submit_for_closure"):
            return [IsAudit()]
        if self.action in ("respond", "submit_plan", "review_implementation"):
            return [IsDepartmentHead()]
        if self.action == "council_closure":
            return [IsCouncil()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        recommendation = serializer.save()
        log_action(
            self.request.user, "recommendation_created",
            recommendation=recommendation, report=recommendation.report,
            text=recommendation.text[:200],
        )
        # Background-style AI similarity flagging (human confirmation required).
        from apps.ai_similarity.service import flag_if_recurring
        flag_if_recurring(recommendation, user=self.request.user)
        # Optional AI analysis — must never block or fail recommendation creation.
        try:
            from django.conf import settings as django_settings
            if django_settings.AI_ENABLED:
                from apps.ai.services.recommendation_analyzer import analyze_recommendation
                from apps.ai.services.similarity_service import similar_for
                analyze_recommendation(recommendation, self.request.user)
                similar_for(recommendation, self.request.user)
        except Exception:
            import logging
            logging.getLogger("apps.ai").warning("ai_on_create_skipped", exc_info=True)

    def perform_update(self, serializer):
        if serializer.instance.status != Recommendation.Status.DRAFT:
            raise WorkflowError("Only draft recommendations can be edited.")
        serializer.save()

    def _detail(self, request, recommendation):
        recommendation.refresh_from_db()
        data = RecommendationDetailSerializer(
            self.get_queryset().get(pk=recommendation.pk), context={"request": request}
        ).data
        return Response(data)

    # -- Department response ------------------------------------------------
    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        recommendation = self.get_object()
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        # Multipart submissions (attachment) carry the nested plan as a JSON string.
        plan_raw = data.get("plan")
        if isinstance(plan_raw, str) and plan_raw.strip():
            import json
            try:
                data["plan"] = json.loads(plan_raw)
            except json.JSONDecodeError:
                return Response({"plan": "Invalid JSON."}, status=status.HTTP_400_BAD_REQUEST)
        elif plan_raw == "":
            data.pop("plan")
        serializer = RespondInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        plan_data = self._resolve_plan_data(serializer.validated_data.get("plan"))
        services.submit_response(
            recommendation,
            request.user,
            decision=serializer.validated_data["decision"],
            justification=serializer.validated_data.get("justification", ""),
            attachment=serializer.validated_data.get("attachment"),
            plan_data=plan_data,
        )
        return self._detail(request, recommendation)

    # -- Audit review of the response ----------------------------------------
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        recommendation = self.get_object()
        serializer = ReviewInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.review_response(
            recommendation, request.user,
            accept=serializer.validated_data["accept"],
            notes=serializer.validated_data.get("notes", ""),
        )
        return self._detail(request, recommendation)

    # -- Action plan ----------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="action-plan")
    def submit_plan(self, request, pk=None):
        recommendation = self.get_object()
        serializer = ActionPlanInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.submit_action_plan(
            recommendation, request.user,
            self._resolve_plan_data(serializer.validated_data),
        )
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"], url_path="action-plan/review")
    def review_plan(self, request, pk=None):
        recommendation = self.get_object()
        serializer = ReviewInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.review_action_plan(
            recommendation, request.user,
            approve=serializer.validated_data["accept"],
            notes=serializer.validated_data.get("notes", ""),
        )
        return self._detail(request, recommendation)

    # -- Execution -------------------------------------------------------------
    @action(detail=True, methods=["post"], url_path=r"steps/(?P<step_id>\d+)/progress")
    def step_progress(self, request, pk=None, step_id=None):
        recommendation = self.get_object()
        serializer = StepProgressInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            step = ActionStep.objects.get(pk=step_id, plan__recommendation=recommendation)
        except ActionStep.DoesNotExist:
            return Response({"detail": "Step not found."}, status=status.HTTP_404_NOT_FOUND)
        services.update_step_progress(
            recommendation, step, request.user,
            progress_percent=serializer.validated_data.get("progress_percent"),
            is_done=serializer.validated_data.get("is_done"),
            comments=serializer.validated_data.get("comments"),
        )
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"])
    def evidence(self, request, pk=None):
        recommendation = self.get_object()
        serializer = EvidenceInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        step = None
        step_id = serializer.validated_data.get("step")
        if step_id:
            try:
                step = ActionStep.objects.get(pk=step_id, plan__recommendation=recommendation)
            except ActionStep.DoesNotExist:
                return Response({"detail": "Step not found."}, status=status.HTTP_404_NOT_FOUND)
        evidence = services.add_evidence(
            recommendation, request.user,
            file=serializer.validated_data["file"],
            step=step,
            notes=serializer.validated_data.get("notes", ""),
        )
        try:
            from django.conf import settings as django_settings
            if django_settings.AI_ENABLED and evidence is not None:
                from apps.ai.services.evidence_analyzer import analyze_evidence
                analyze_evidence(evidence, request.user)
        except Exception:
            import logging
            logging.getLogger("apps.ai").warning("ai_on_evidence_skipped", exc_info=True)
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"], url_path="mark-implemented")
    def mark_implemented(self, request, pk=None):
        recommendation = self.get_object()
        services.mark_implemented(recommendation, request.user)
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"], url_path="review-implementation")
    def review_implementation(self, request, pk=None):
        recommendation = self.get_object()
        serializer = ReviewInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.review_implementation(
            recommendation, request.user,
            accept=serializer.validated_data["accept"],
            notes=serializer.validated_data.get("notes", ""),
        )
        return self._detail(request, recommendation)

    # -- Verification ------------------------------------------------------------
    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        recommendation = self.get_object()
        serializer = VerifyInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.verify(
            recommendation, request.user,
            decision=serializer.validated_data["decision"],
            notes=serializer.validated_data.get("notes", ""),
            rejected_items=serializer.validated_data.get("rejected_items", ""),
            rejection_reason=serializer.validated_data.get("rejection_reason", ""),
            required_action=serializer.validated_data.get("required_action", ""),
            action_deadline=serializer.validated_data.get("action_deadline"),
        )
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"], url_path="submit-for-closure")
    def submit_for_closure(self, request, pk=None):
        recommendation = self.get_object()
        services.submit_for_closure(
            recommendation, request.user, notes=request.data.get("notes", "")
        )
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"], url_path="council-closure")
    def council_closure(self, request, pk=None):
        recommendation = self.get_object()
        serializer = ReviewInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.council_closure(
            recommendation, request.user,
            accept=serializer.validated_data["accept"],
            notes=serializer.validated_data.get("notes", ""),
        )
        return self._detail(request, recommendation)

    # -- Recurrence (human-in-the-loop) --------------------------------------------
    @action(detail=True, methods=["post"], url_path="confirm-recurrence")
    def confirm_recurrence(self, request, pk=None):
        recommendation = self.get_object()
        confirmed = bool(request.data.get("confirmed"))
        services.confirm_recurrence(recommendation, request.user, confirmed)
        return self._detail(request, recommendation)

    @action(detail=True, methods=["post"], url_path="check-similar", permission_classes=[IsAudit])
    def check_similar(self, request, pk=None):
        from apps.ai.services.similarity_service import DISPLAY_MIN_SCORE
        from apps.ai_similarity.service import find_similar
        from apps.audits.finding import brief_excerpt, case_title
        recommendation = self.get_object()
        matches = find_similar(recommendation, top_k=3, min_score=DISPLAY_MIN_SCORE)
        return Response({
            "matches": [
                {
                    "id": rec.id,
                    "title": case_title(rec.text),
                    "text": brief_excerpt(rec.text),
                    "report_title": rec.report.title,
                    "status": rec.status,
                    "score": round(score, 4),
                }
                for rec, score in matches
            ]
        })

    # -- Helpers ----------------------------------------------------------------
    def _resolve_plan_data(self, plan_input):
        if not plan_input:
            return None
        try:
            employee = User.objects.get(pk=plan_input["responsible_employee"])
        except User.DoesNotExist:
            raise WorkflowError("Responsible employee not found.")
        return {
            "responsible_employee": employee,
            "target_date": plan_input["target_date"],
            "notes": plan_input.get("notes", ""),
            "steps": plan_input.get("steps"),
        }
