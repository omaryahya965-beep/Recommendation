from django.db import models


class Municipality(models.Model):
    """Tenant root: every business row links back here."""

    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "municipalities"

    def __str__(self):
        return self.name


class Department(models.Model):
    municipality = models.ForeignKey(
        Municipality, on_delete=models.CASCADE, related_name="departments"
    )
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("municipality", "name")]

    def __str__(self):
        return f"{self.name} ({self.municipality.name})"


class WorkflowPolicy(models.Model):
    """Per-municipality workflow configuration.

    Approval stages are configurable here rather than hardcoded to one
    municipal structure.
    """

    municipality = models.OneToOneField(
        Municipality, on_delete=models.CASCADE, related_name="workflow_policy"
    )
    # Default False: the action plan is requested AFTER council ratification.
    # True: departments must submit the plan together with their response.
    require_plan_with_response = models.BooleanField(default=False)
    # Whether the department head must approve employee submissions before
    # they reach internal audit verification.
    require_head_review_before_verification = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "workflow policies"

    def __str__(self):
        return f"Policy for {self.municipality.name}"
