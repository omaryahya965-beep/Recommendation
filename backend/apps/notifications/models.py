from django.conf import settings
from django.db import models


class ReminderRule(models.Model):
    """Configurable reminder schedule — many rules per municipality.

    offset_days is relative to the action plan target date:
      negative = days before the deadline, 0 = due today, positive = overdue.
    Rules are fully editable from the audit UI; nothing is hardcoded.
    """

    class RecipientRole(models.TextChoices):
        EMPLOYEE = "employee", "Responsible employee"
        DEPARTMENT_HEAD = "department_head", "Department head"
        AUDIT = "audit", "Internal audit (escalation)"

    municipality = models.ForeignKey(
        "organizations.Municipality", on_delete=models.CASCADE, related_name="reminder_rules"
    )
    offset_days = models.IntegerField(
        help_text="Negative = before deadline, 0 = due today, positive = days overdue."
    )
    enabled = models.BooleanField(default=True)
    recipient_role = models.CharField(
        max_length=20, choices=RecipientRole.choices, default=RecipientRole.EMPLOYEE
    )
    label = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["offset_days"]
        unique_together = [("municipality", "offset_days", "recipient_role")]

    def __str__(self):
        when = (
            f"{-self.offset_days}d before deadline" if self.offset_days < 0
            else "on deadline" if self.offset_days == 0
            else f"{self.offset_days}d overdue"
        )
        return f"{self.municipality.name}: {when} -> {self.get_recipient_role_display()}"


class Notification(models.Model):
    class Type(models.TextChoices):
        DEADLINE_APPROACHING = "deadline_approaching", "Deadline approaching"
        DUE_TODAY = "due_today", "Due today"
        OVERDUE = "overdue", "Overdue"
        RESPONSE_NEEDED = "response_needed", "Response needed"
        RETURNED = "returned", "Returned"
        ACTION_REQUIRED = "action_required", "Action required"
        STATUS_CHANGE = "status_change", "Status change"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    recommendation = models.ForeignKey(
        "audits.Recommendation",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=30, choices=Type.choices)
    message = models.TextField(blank=True)
    # Idempotency guard: reminder jobs write a deterministic key per
    # (rule, recommendation, user, date) so re-running a job can never
    # produce duplicate notifications. NULL for ad-hoc notifications.
    dedupe_key = models.CharField(max_length=255, null=True, blank=True, unique=True)
    is_read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]
        indexes = [models.Index(fields=["user", "is_read"])]

    def __str__(self):
        return f"{self.get_type_display()} -> {self.user}"
