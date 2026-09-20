"""AI intelligence API. Advisory only — never mutates workflow status."""
import logging

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import SimpleRateThrottle

class AIUserRateThrottle(SimpleRateThrottle):
    """Per-user limit on AI endpoints.

    The rate comes from DEFAULT_THROTTLE_RATES['ai'] rather than being hard
    coded, and the counters live in the shared cache, so the limit holds
    across serverless instances instead of resetting per cold start.
    """

    scope = "ai"

    def get_cache_key(self, request, view):
        if request.user.is_authenticated:
            return f"throttle_ai_user_{request.user.id}"
        return self.get_ident(request)

from apps.accounts.models import User
from apps.ai.exceptions import AIError, AIUnavailable
from apps.ai.providers.llm import USER_SAFE_UNAVAILABLE
from apps.ai.models import AIAnalysis, AIJob
from apps.ai.providers import provider_meta
from apps.ai.services.action_plan_generator import suggest_action_plan
from apps.ai.services.audit_assistant import clear_conversation, run_assistant
from apps.ai.services.common import (
    latest_analysis,
    output_matches_language,
    require_ai_enabled,
    run_job,
    serialize_analysis,
    serialize_job,
    serialize_live,
)
from apps.ai.services.evidence_analyzer import analyze_evidence
from apps.ai.services.recommendation_analyzer import analyze_recommendation, live_recommendation_analysis
from apps.ai.services.risk_engine import estimate_delay_risk, live_delay_risk
from apps.ai.services.similarity_service import similar_for
from apps.ai.services.summarizer import generate_summary
from apps.ai.services.trend_analyzer import build_dashboard_insights
from apps.ai_similarity.service import active_backend
from apps.audits.models import Recommendation
from apps.core.permissions import scope_recommendations
from apps.workflow.models import Evidence

from .serializers import AssistantRequestSerializer, SummaryRequestSerializer

logger = logging.getLogger("apps.ai")


def _language(request) -> str:
    if request.method == "GET":
        raw = request.query_params.get("language")
    else:
        raw = (request.data or {}).get("language") or request.query_params.get("language")
    return raw or "ar"


def _ai_error(exc: Exception) -> Response:
    if isinstance(exc, AIError):
        return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)
    return Response({"detail": str(exc)[:500], "code": "ai_error"}, status=500)


def scoped_recommendation(request, pk):
    rec = scope_recommendations(
        Recommendation.objects.select_related(
            "report__department", "report__municipality", "action_plan", "response",
            "similar_recommendation",
        ).prefetch_related(
            "action_plan__steps", "evidence_files", "verifications", "trail_entries",
        ),
        request.user,
    ).filter(pk=pk).first()
    if rec is None:
        raise AIError("Recommendation not found.", http_status=404)
    return rec


def scoped_evidence(request, pk):
    rec_ids = scope_recommendations(Recommendation.objects.all(), request.user).values_list("id", flat=True)
    evidence = (
        Evidence.objects.select_related("recommendation__report", "step", "recommendation")
        .filter(pk=pk, recommendation_id__in=rec_ids)
        .first()
    )
    if evidence is None:
        raise AIError("Evidence not found.", http_status=404)
    return evidence


class AIHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        meta = provider_meta()
        return Response({
            "enabled": settings.AI_ENABLED,
            "provider": meta["provider"],
            "model": meta["model"],
            "local_or_remote_mode": meta.get("local_or_remote_mode", "local"),
            "embedding_backend": active_backend(),
            "embedding_model": meta["embedding_model"],
            "configuration_status": meta.get("configuration_status", "ok"),
            "similarity_threshold": settings.AI_SIMILARITY_THRESHOLD,
        })


class RecommendationAnalyzeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def get(self, request, pk):
        try:
            rec = scoped_recommendation(request, pk)
        except AIError as exc:
            return _ai_error(exc)
        analysis = latest_analysis(AIAnalysis.AnalysisType.RECOMMENDATION, "recommendation", rec.id)
        lang = _language(request)
        if analysis is not None and output_matches_language(analysis.output, lang):
            return Response(serialize_analysis(analysis))
        return Response(
            serialize_live(
                analysis_type=AIAnalysis.AnalysisType.RECOMMENDATION,
                target_type="recommendation",
                target_id=rec.id,
                output=live_recommendation_analysis(rec, _language(request)),
            )
        )

    def post(self, request, pk):
        try:
            require_ai_enabled()
            rec = scoped_recommendation(request, pk)
            lang = _language(request)
            job = run_job(
                user=request.user,
                job_type="recommendation_analysis",
                target_type="recommendation",
                target_id=rec.id,
                fn=lambda: analyze_recommendation(rec, request.user, lang),
            )
            return Response(serialize_job(job), status=200)
        except Exception as exc:
            return _ai_error(exc)


class RecommendationSimilarView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def get(self, request, pk):
        try:
            rec = scoped_recommendation(request, pk)
        except AIError as exc:
            return _ai_error(exc)
        analysis = latest_analysis(AIAnalysis.AnalysisType.SIMILARITY, "recommendation", rec.id)
        if analysis is None:
            return Response({"detail": "No similarity analysis yet.", "analysis": None})
        return Response(serialize_analysis(analysis))

    def post(self, request, pk):
        try:
            require_ai_enabled()
            rec = scoped_recommendation(request, pk)
            lang = _language(request)
            job = run_job(
                user=request.user,
                job_type="similarity",
                target_type="recommendation",
                target_id=rec.id,
                fn=lambda: similar_for(rec, request.user, lang),
            )
            return Response(serialize_job(job))
        except Exception as exc:
            return _ai_error(exc)


class ActionPlanSuggestView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def post(self, request, pk):
        try:
            require_ai_enabled()
            user = request.user
            if user.role not in (User.Role.DEPARTMENT_HEAD, User.Role.AUDIT):
                return Response({"detail": "Not authorized."}, status=403)
            rec = scoped_recommendation(request, pk)
            if user.role == User.Role.DEPARTMENT_HEAD and rec.report.department_id != user.department_id:
                return Response({"detail": "Not authorized."}, status=403)
            lang = _language(request)
            job = run_job(
                user=user,
                job_type="action_plan_suggest",
                target_type="recommendation",
                target_id=rec.id,
                fn=lambda: suggest_action_plan(rec, user, lang),
            )
            return Response(serialize_job(job))
        except Exception as exc:
            return _ai_error(exc)


class RecommendationRiskView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def get(self, request, pk):
        try:
            rec = scoped_recommendation(request, pk)
        except AIError as exc:
            return _ai_error(exc)
        analysis = latest_analysis(AIAnalysis.AnalysisType.RISK, "recommendation", rec.id)
        lang = _language(request)
        if analysis is not None and output_matches_language(analysis.output, lang):
            return Response(serialize_analysis(analysis))
        return Response(
            serialize_live(
                analysis_type=AIAnalysis.AnalysisType.RISK,
                target_type="recommendation",
                target_id=rec.id,
                output=live_delay_risk(rec, _language(request)),
            )
        )

    def post(self, request, pk):
        try:
            require_ai_enabled()
            rec = scoped_recommendation(request, pk)
            lang = _language(request)
            job = run_job(
                user=request.user,
                job_type="risk",
                target_type="recommendation",
                target_id=rec.id,
                fn=lambda: estimate_delay_risk(rec, request.user, lang),
            )
            return Response(serialize_job(job))
        except Exception as exc:
            return _ai_error(exc)


class EvidenceAnalyzeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def get(self, request, pk):
        try:
            evidence = scoped_evidence(request, pk)
        except AIError as exc:
            return _ai_error(exc)
        analysis = latest_analysis(AIAnalysis.AnalysisType.EVIDENCE, "evidence", evidence.id)
        if analysis is None:
            return Response({"detail": "No evidence analysis yet.", "analysis": None})
        return Response(serialize_analysis(analysis))

    def post(self, request, pk):
        try:
            require_ai_enabled()
            evidence = scoped_evidence(request, pk)
            lang = _language(request)
            job = run_job(
                user=request.user,
                job_type="evidence_analysis",
                target_type="evidence",
                target_id=evidence.id,
                fn=lambda: analyze_evidence(evidence, request.user, lang),
            )
            return Response(serialize_job(job))
        except Exception as exc:
            return _ai_error(exc)


class DashboardInsightsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.AI_ENABLED:
            return Response({"available": False, "detail": "AI unavailable"})
        qs = scope_recommendations(
            Recommendation.objects.select_related(
                "report__department", "action_plan__responsible_employee"
            ),
            request.user,
        ).exclude(status=Recommendation.Status.DRAFT)
        lang = _language(request)
        try:
            payload = build_dashboard_insights(qs, request, request.user, lang)
            return Response(payload)
        except Exception as exc:
            return _ai_error(exc)


class SummaryView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def get(self, request):
        scope = request.query_params.get("scope") or "recommendation"
        rec_id = request.query_params.get("recommendation_id")
        if scope != "recommendation" or not rec_id:
            return Response({"detail": "No summary yet.", "analysis": None})
        try:
            rec = scoped_recommendation(request, rec_id)
        except AIError as exc:
            return _ai_error(exc)
        analysis = latest_analysis(AIAnalysis.AnalysisType.SUMMARY, "recommendation", rec.id)
        lang = request.query_params.get("language") or "ar"
        if (
            analysis is None
            or not (analysis.output or {}).get("stats", {}).get("reference")
            or not output_matches_language(analysis.output, lang)
        ):
            return Response({"detail": "No summary yet.", "analysis": None})
        return Response(serialize_analysis(analysis))

    def post(self, request):
        ser = SummaryRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            require_ai_enabled()
            lang = ser.validated_data.get("language") or "ar"
            job = run_job(
                user=request.user,
                job_type="summary",
                target_type=ser.validated_data["scope"],
                target_id=ser.validated_data.get("recommendation_id")
                or ser.validated_data.get("department_id")
                or ser.validated_data.get("report_id")
                or ser.validated_data.get("followup_report_id")
                or 0,
                fn=lambda: generate_summary(request.user, ser.validated_data, lang),
            )
            return Response(serialize_job(job))
        except Exception as exc:
            return _ai_error(exc)


class AssistantView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIUserRateThrottle]

    def post(self, request):
        ser = AssistantRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            require_ai_enabled()
            result = run_assistant(
                request.user,
                ser.validated_data["message"],
                ser.validated_data.get("language") or "ar",
                ser.validated_data.get("conversation_id"),
                context={
                    "recommendation_id": ser.validated_data.get("recommendation_id"),
                    "report_id": ser.validated_data.get("report_id"),
                    "department_id": ser.validated_data.get("department_id"),
                    "role": ser.validated_data.get("role"),
                    "route": ser.validated_data.get("route"),
                }
            )
            # Safe browser response enforcement: strip raw database tool outputs
            result.pop("tool_results", None)
            return Response(result)
        except AIUnavailable:
            logger.warning("ai_assistant_unavailable")
            return Response(
                {"detail": USER_SAFE_UNAVAILABLE, "code": "ai_unavailable"},
                status=503,
            )
        except AIError as exc:
            return _ai_error(exc)
        except Exception:
            logger.exception("ai_assistant_unhandled")
            return Response(
                {"detail": USER_SAFE_UNAVAILABLE, "code": "ai_unavailable"},
                status=503,
            )


class AssistantClearView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        clear_conversation(request.user)
        return Response({"cleared": True})


class AssistantClearMemoryView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        convo = AIConversation.objects.filter(user=request.user, municipality=request.user.municipality).first()
        if convo:
            convo.messages.filter(role=AIMessage.Role.SYSTEM).delete()
        return Response({"memory_cleared": True})


class AIJobStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        job = AIJob.objects.filter(pk=pk, created_by=request.user).first()
        if job is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_job(job))


class AnalysisReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.AUDIT:
            return Response({"detail": "Not authorized."}, status=403)
        analysis = AIAnalysis.objects.filter(
            pk=pk, municipality=request.user.municipality
        ).first()
        if analysis is None:
            return Response({"detail": "Not found."}, status=404)
        analysis.human_reviewed = bool(request.data.get("reviewed", True))
        analysis.save(update_fields=["human_reviewed"])
        return Response(serialize_analysis(analysis))
