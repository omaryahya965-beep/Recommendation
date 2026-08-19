from django.contrib import admin

from .models import AuditTrail


@admin.register(AuditTrail)
class AuditTrailAdmin(admin.ModelAdmin):
    """Read-only view of the append-only trail."""

    list_display = ("created_at", "user", "action", "recommendation", "report")
    list_filter = ("action",)
    readonly_fields = [f.name for f in AuditTrail._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
