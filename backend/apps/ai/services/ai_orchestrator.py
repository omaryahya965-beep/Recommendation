"""Facade used by API views. Does not change workflow state."""
from apps.ai.services.action_plan_generator import suggest_action_plan
from apps.ai.services.audit_assistant import clear_conversation, run_assistant
from apps.ai.services.common import latest_analysis, run_job, serialize_analysis, serialize_job
from apps.ai.services.evidence_analyzer import analyze_evidence
from apps.ai.services.recommendation_analyzer import analyze_recommendation
from apps.ai.services.risk_engine import estimate_delay_risk
from apps.ai.services.similarity_service import similar_for
from apps.ai.services.summarizer import generate_summary
from apps.ai.services.trend_analyzer import build_dashboard_insights

__all__ = [
    "analyze_recommendation",
    "suggest_action_plan",
    "analyze_evidence",
    "estimate_delay_risk",
    "similar_for",
    "generate_summary",
    "build_dashboard_insights",
    "run_assistant",
    "clear_conversation",
    "run_job",
    "latest_analysis",
    "serialize_analysis",
    "serialize_job",
]
