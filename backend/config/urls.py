from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.routers import DefaultRouter

# Swagger UI runs in a plain browser tab with no Bearer token, so production
# docs are gated on the Django admin session rather than on JWT.
_DOCS_PERMISSIONS = [AllowAny] if settings.DEBUG else [IsAdminUser]
_DOCS_AUTHENTICATION = [SessionAuthentication]

from apps.accounts.views import (
    ChangePasswordView,
    EmployeeListView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
)
from apps.audits.views import AuditReportViewSet, PendingApprovalsView, RecommendationViewSet
from apps.core.views import AnalyticsView, DashboardView, HealthView
from apps.core.media_views import EvidenceDownloadView, MediaSignView
from apps.followup.views import FollowUpReportViewSet
from apps.notifications.cron import SendRemindersView
from apps.notifications.views import NotificationViewSet, ReminderRuleViewSet
from apps.organizations.views import DepartmentViewSet, WorkflowPolicyView

router = DefaultRouter()
router.register("reports", AuditReportViewSet, basename="report")
router.register("recommendations", RecommendationViewSet, basename="recommendation")
router.register("departments", DepartmentViewSet, basename="department")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("reminder-rules", ReminderRuleViewSet, basename="reminder-rule")
router.register("followup-reports", FollowUpReportViewSet, basename="followup-report")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", LoginView.as_view(), name="login"),
    # RefreshView carries SafeTokenRefreshSerializer: a refresh token whose user
    # row is gone must be 401, not a 500 from SimpleJWT's bare .get().
    path("api/auth/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("api/employees/", EmployeeListView.as_view(), name="employees"),
    path("api/workflow-policy/", WorkflowPolicyView.as_view(), name="workflow-policy"),
    path("api/council/pending-approvals/", PendingApprovalsView.as_view(), name="pending-approvals"),
    path("api/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/analytics/", AnalyticsView.as_view(), name="analytics"),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/media/sign/", MediaSignView.as_view(), name="media-sign"),
    path(
        "api/evidence/<int:pk>/download/",
        EvidenceDownloadView.as_view(),
        name="evidence-download",
    ),
    path("api/internal/send-reminders/", SendRemindersView.as_view(), name="send-reminders"),
    path("api/ai/", include("apps.ai.api.urls")),
    path("api/", include(router.urls)),
    # The schema describes every endpoint and payload of a government audit
    # system. Open locally, staff-only (via the admin session) in production.
    path(
        "api/schema/",
        SpectacularAPIView.as_view(
            permission_classes=_DOCS_PERMISSIONS,
            authentication_classes=_DOCS_AUTHENTICATION,
        ),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(
            url_name="schema",
            permission_classes=_DOCS_PERMISSIONS,
            authentication_classes=_DOCS_AUTHENTICATION,
        ),
        name="docs",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
