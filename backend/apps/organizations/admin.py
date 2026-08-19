from django.contrib import admin

from .models import Department, Municipality, WorkflowPolicy


@admin.register(Municipality)
class MunicipalityAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "municipality")
    list_filter = ("municipality",)


@admin.register(WorkflowPolicy)
class WorkflowPolicyAdmin(admin.ModelAdmin):
    list_display = ("municipality", "require_plan_with_response")
