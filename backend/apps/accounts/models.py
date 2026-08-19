from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        AUDIT = "audit", "Internal Audit"
        DEPARTMENT_HEAD = "department_head", "Department Head"
        EMPLOYEE = "employee", "Employee"
        COUNCIL = "council", "Municipal Council / Audit Committee"

    role = models.CharField(max_length=20, choices=Role.choices, blank=True)
    department = models.ForeignKey(
        "organizations.Department",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="members",
    )
    # Nullable only so Django superusers can exist outside any tenant;
    # all business users must have a municipality (enforced in serializers).
    municipality = models.ForeignKey(
        "organizations.Municipality",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="users",
    )
    full_name_ar = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
