from django.contrib import admin

from .models import (
    ActionPlan,
    ActionStep,
    ApprovalRecord,
    Evidence,
    ManagementResponse,
    VerificationDecision,
)


class ActionStepInline(admin.TabularInline):
    model = ActionStep
    extra = 0


@admin.register(ManagementResponse)
class ManagementResponseAdmin(admin.ModelAdmin):
    list_display = ("recommendation", "decision", "review_status", "submitted_by", "revision_count")
    list_filter = ("decision", "review_status")


@admin.register(ApprovalRecord)
class ApprovalRecordAdmin(admin.ModelAdmin):
    list_display = ("recommendation", "approval_type", "approved_by", "created_at")
    list_filter = ("approval_type",)


@admin.register(ActionPlan)
class ActionPlanAdmin(admin.ModelAdmin):
    list_display = ("recommendation", "responsible_employee", "target_date", "status", "revision_count")
    list_filter = ("status",)
    inlines = [ActionStepInline]


@admin.register(Evidence)
class EvidenceAdmin(admin.ModelAdmin):
    list_display = ("recommendation", "step", "uploaded_by", "uploaded_at")


@admin.register(VerificationDecision)
class VerificationDecisionAdmin(admin.ModelAdmin):
    list_display = ("recommendation", "decision", "reviewed_by", "created_at")
    list_filter = ("decision",)
