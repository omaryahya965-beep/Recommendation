from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("username", "full_name_ar", "role", "department", "municipality", "is_active")
    list_filter = ("role", "municipality", "department")
    fieldsets = UserAdmin.fieldsets + (
        ("Organization", {"fields": ("role", "municipality", "department", "full_name_ar")}),
    )
