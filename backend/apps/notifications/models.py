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
    # Report-level events (a report sent to the department or the council,
    # ratified) are one notification per report, not one per recommendation.
    report = models.ForeignKey(
        "audits.AuditReport",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=30, choices=Type.choices)
    message = models.TextField(blank=True)
    # Locale-neutral form of `message` (BUG-16): the UI renders the key's
    # template in the reader's language with these parameters. Empty on rows
    # written before this existed; the UI then shows `message`.
    message_key = models.CharField(max_length=60, blank=True, default="")
    message_params = models.JSONField(default=dict, blank=True)
    # Idempotency guard: reminder jobs write a deterministic key per
    # (rule, recommendation, user, date) so re-running a job can never
    # produce duplicate notifications. NULL for ad-hoc notifications.
    dedupe_key = models.CharField(max_length=255, null=True, blank=True, unique=True)
    is_read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            # The inbox lists a user's notifications newest first.
            models.Index(fields=["user", "-sent_at"], name="notif_user_sent_idx"),
        ]

    def __str__(self):
        return f"{self.get_type_display()} -> {self.user}"


class ReminderRun(models.Model):
    """One pass of the reminder engine (cron, command or manual).

    Kept so a dead or failing cron is visible in the reminder settings
    instead of silently producing no reminders.
    """

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        OK = "ok", "Completed"
        FAILED = "failed", "Failed"

    trigger = models.CharField(max_length=20, default="command")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    sent = models.IntegerField(default=0)
    superseded = models.IntegerField(default=0)
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"Reminder run {self.started_at:%Y-%m-%d %H:%M} ({self.status})"


class ReminderDispatch(models.Model):
    """One reminder milestone for one recipient: sent, or superseded.

    The deduplication record for the catch-up engine. It is keyed by rule,
    case, recipient, deadline source and deadline, and lives apart from the
    Notification so that a user deleting a notification can never cause the
    same reminder to be sent again. A changed deadline gives new keys, so a
    moved deadline starts a fresh reminder cycle.
    """

    class Outcome(models.TextChoices):
        SENT = "sent", "Sent"
        SUPERSEDED = "superseded", "Superseded by a later reminder"

    class Anchor(models.TextChoices):
        PLAN = "plan", "Action plan deadline"
        VERIFICATION = "verification", "Deadline set at verification"
        RESPONSE = "response", "Response deadline"

    key = models.CharField(max_length=255, unique=True)
    rule = models.ForeignKey(
        ReminderRule, null=True, blank=True, on_delete=models.SET_NULL, related_name="dispatches"
    )
    # Snapshot of the rule, so history survives the rule being edited or deleted.
    offset_days = models.IntegerField()
    recipient_role = models.CharField(max_length=20)
    recommendation = models.ForeignKey(
        "audits.Recommendation", on_delete=models.CASCADE, related_name="reminder_dispatches"
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminder_dispatches"
    )
    anchor = models.CharField(max_length=20, choices=Anchor.choices)
    deadline = models.DateField()
    outcome = models.CharField(max_length=12, choices=Outcome.choices)
    notification = models.ForeignKey(
        Notification, null=True, blank=True, on_delete=models.SET_NULL, related_name="dispatches"
    )
    run = models.ForeignKey(
        ReminderRun, null=True, blank=True, on_delete=models.SET_NULL, related_name="dispatches"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recommendation", "-created_at"])]

    def __str__(self):
        return f"{self.outcome}: {self.key}"
