from django.contrib import admin

from .models import Notification, ReminderRule


@admin.register(ReminderRule)
class ReminderRuleAdmin(admin.ModelAdmin):
    list_display = ("municipality", "offset_days", "recipient_role", "enabled")
    list_filter = ("municipality", "enabled", "recipient_role")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "recommendation", "is_read", "sent_at")
    list_filter = ("type", "is_read")
