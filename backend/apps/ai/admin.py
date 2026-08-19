from django.contrib import admin

from .models import AIAnalysis, AIConversation, AIJob, AIMessage


@admin.register(AIAnalysis)
class AIAnalysisAdmin(admin.ModelAdmin):
    list_display = ("analysis_type", "target_type", "target_id", "provider", "model", "created_at")
    list_filter = ("analysis_type", "provider")
    readonly_fields = [f.name for f in AIAnalysis._meta.fields]


@admin.register(AIJob)
class AIJobAdmin(admin.ModelAdmin):
    list_display = ("job_type", "status", "created_by", "created_at")
    list_filter = ("status", "job_type")


class AIMessageInline(admin.TabularInline):
    model = AIMessage
    extra = 0
    readonly_fields = ("role", "content", "created_at")


@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "municipality", "updated_at")
    inlines = [AIMessageInline]
