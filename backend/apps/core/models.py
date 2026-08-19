from django.conf import settings
from django.db import models


class AuditTrail(models.Model):
    """Append-only action log.

    The system itself is an audit tool, so entries can never be updated or
    deleted once written. This is enforced at the model level; the API layer
    exposes read-only access only.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="trail_entries"
    )
    action = models.CharField(max_length=255)
    recommendation = models.ForeignKey(
        "audits.Recommendation",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trail_entries",
    )
    report = models.ForeignKey(
        "audits.AuditReport",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trail_entries",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["recommendation", "created_at"])]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValueError("AuditTrail entries are append-only and cannot be updated.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("AuditTrail entries are append-only and cannot be deleted.")

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.user} {self.action}"


def log_action(user, action, recommendation=None, report=None, **metadata):
    """Convenience helper used by every workflow mutation."""
    return AuditTrail.objects.create(
        user=user,
        action=action,
        recommendation=recommendation,
        report=report,
        metadata=metadata,
    )
