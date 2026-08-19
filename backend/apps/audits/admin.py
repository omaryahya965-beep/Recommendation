from django.contrib import admin

from .models import AuditReport, Recommendation


class RecommendationInline(admin.TabularInline):
    model = Recommendation
    extra = 0
    fields = ("text", "risk_level", "priority_score", "status")


@admin.register(AuditReport)
class AuditReportAdmin(admin.ModelAdmin):
    list_display = ("title", "municipality", "department", "engagement_type", "status", "council_approval_date")
    list_filter = ("status", "engagement_type", "municipality")
    inlines = [RecommendationInline]


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ("__str__", "report", "risk_level", "priority_score", "status", "is_recurring")
    list_filter = ("status", "risk_level", "is_recurring")
    search_fields = ("text",)
