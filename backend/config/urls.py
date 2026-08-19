from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import EmployeeListView, LoginView, MeView
from apps.audits.views import AuditReportViewSet, PendingApprovalsView, RecommendationViewSet
from apps.core.views import DashboardView, HealthView
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
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/employees/", EmployeeListView.as_view(), name="employees"),
    path("api/workflow-policy/", WorkflowPolicyView.as_view(), name="workflow-policy"),
    path("api/council/pending-approvals/", PendingApprovalsView.as_view(), name="pending-approvals"),
    path("api/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/internal/send-reminders/", SendRemindersView.as_view(), name="send-reminders"),
    path("api/ai/", include("apps.ai.api.urls")),
    path("api/", include(router.urls)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
