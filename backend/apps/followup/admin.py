from django.contrib import admin

from .models import FollowUpReport


@admin.register(FollowUpReport)
class FollowUpReportAdmin(admin.ModelAdmin):
    list_display = ("municipality", "period_start", "period_end", "generated_by", "created_at")
