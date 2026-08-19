from django.conf import settings
from django.db import models


class FollowUpReport(models.Model):
    """Periodic follow-up report presented to the council.

    The snapshot is computed from live database data at generation time and
    frozen here for the record — never hand-entered.
    """

    municipality = models.ForeignKey(
        "organizations.Municipality", on_delete=models.CASCADE, related_name="followup_reports"
    )
    period_start = models.DateField()
    period_end = models.DateField()
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="followups_generated"
    )
    snapshot = models.JSONField(
        default=dict,
        help_text="Frozen statistics and per-recommendation statuses at generation time.",
    )
    generated_file = models.FileField(upload_to="followup_reports/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Follow-up {self.period_start} .. {self.period_end} ({self.municipality.name})"
