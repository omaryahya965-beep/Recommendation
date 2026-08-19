from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.AIHealthView.as_view(), name="ai-health"),
    path("recommendations/<int:pk>/analyze/", views.RecommendationAnalyzeView.as_view(), name="ai-rec-analyze"),
    path("recommendations/<int:pk>/similar/", views.RecommendationSimilarView.as_view(), name="ai-rec-similar"),
    path(
        "recommendations/<int:pk>/action-plan/suggest/",
        views.ActionPlanSuggestView.as_view(),
        name="ai-rec-plan-suggest",
    ),
    path("recommendations/<int:pk>/risk/", views.RecommendationRiskView.as_view(), name="ai-rec-risk"),
    path("evidence/<int:pk>/analyze/", views.EvidenceAnalyzeView.as_view(), name="ai-evidence-analyze"),
    path("dashboard/insights/", views.DashboardInsightsView.as_view(), name="ai-dashboard-insights"),
    path("summaries/", views.SummaryView.as_view(), name="ai-summaries"),
    path("assistant/", views.AssistantView.as_view(), name="ai-assistant"),
    path("assistant/conversations/", views.AssistantClearView.as_view(), name="ai-assistant-clear"),
    path("jobs/<int:pk>/", views.AIJobStatusView.as_view(), name="ai-job"),
    path("analyses/<int:pk>/review/", views.AnalysisReviewView.as_view(), name="ai-analysis-review"),
]
