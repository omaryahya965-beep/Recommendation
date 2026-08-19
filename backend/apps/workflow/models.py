from django.conf import settings
from django.db import models


class ManagementResponse(models.Model):
    """The department's formal response to a recommendation.

    Mutable across the revision loop; every change is snapshotted into the
    append-only AuditTrail so full history is preserved.
    """

    class Decision(models.TextChoices):
        AGREE = "agree", "Agree"
        DISAGREE = "disagree", "Disagree"

    class ReviewStatus(models.TextChoices):
        PENDING = "pending", "Pending audit review"
        ACCEPTED = "accepted", "Accepted by audit"
        REJECTED = "rejected", "Rejected - revision requested"

    recommendation = models.OneToOneField(
        "audits.Recommendation", on_delete=models.CASCADE, related_name="response"
    )
    decision = models.CharField(max_length=10, choices=Decision.choices)
    justification = models.TextField(
        blank=True, help_text="Mandatory when decision is disagree (enforced in serializer)."
    )
    attachment = models.FileField(upload_to="responses/", null=True, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="responses_submitted"
    )
    review_status = models.CharField(
        max_length=10, choices=ReviewStatus.choices, default=ReviewStatus.PENDING
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="responses_reviewed",
    )
    audit_review_notes = models.TextField(blank=True)
    revision_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Response to REC-{self.recommendation_id} ({self.decision})"


class ApprovalRecord(models.Model):
    """A formal approval event.

    Two distinct types, never collapsed: AUDIT_APPROVAL (internal audit
    approves the response package for council submission) and
    COUNCIL_RATIFICATION (final ratification; the only event that may set the
    reminder anchor date).
    """

    class ApprovalType(models.TextChoices):
        AUDIT_APPROVAL = "audit_approval", "Audit approval"
        COUNCIL_RATIFICATION = "council_ratification", "Council ratification"
        HEAD_IMPLEMENTATION_REVIEW = "head_implementation_review", "Department review of implementation"
        CLOSURE_REVIEW = "closure_review", "Audit closure review"
        CLOSURE_COUNCIL = "closure_council", "Council closure decision"

    recommendation = models.ForeignKey(
        "audits.Recommendation", on_delete=models.CASCADE, related_name="approvals"
    )
    approval_type = models.CharField(max_length=30, choices=ApprovalType.choices)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="approvals_given"
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["recommendation", "approval_type"])]

    def __str__(self):
        return f"{self.get_approval_type_display()} for REC-{self.recommendation_id}"


class ActionPlan(models.Model):
    """Implementation plan. Requested after council ratification by default
    (or with the response when municipal policy requires it); must pass audit
    review before execution starts. Mutable across the revision loop with
    AuditTrail snapshots."""

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted - awaiting audit review"
        REVISION_REQUIRED = "revision_required", "Revision required"
        APPROVED = "approved", "Approved"

    recommendation = models.OneToOneField(
        "audits.Recommendation", on_delete=models.CASCADE, related_name="action_plan"
    )
    responsible_employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="assigned_actions"
    )
    target_date = models.DateField(db_index=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="plans_reviewed",
    )
    review_notes = models.TextField(blank=True)
    revision_count = models.IntegerField(default=0)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="plans_submitted"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Plan for REC-{self.recommendation_id} (target {self.target_date})"


class ActionStep(models.Model):
    plan = models.ForeignKey(ActionPlan, on_delete=models.CASCADE, related_name="steps")
    title = models.CharField(max_length=255, help_text="Should be SMART.")
    order = models.PositiveIntegerField(default=0)
    depends_on = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="dependents"
    )
    is_done = models.BooleanField(default=False)
    progress_percent = models.IntegerField(default=0)
    comments = models.TextField(blank=True)
    is_required_for_closure = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Step {self.order}: {self.title[:50]}"


class Evidence(models.Model):
    recommendation = models.ForeignKey(
        "audits.Recommendation", on_delete=models.CASCADE, related_name="evidence_files"
    )
    step = models.ForeignKey(
        ActionStep, null=True, blank=True, on_delete=models.SET_NULL, related_name="evidence_files"
    )
    file = models.FileField(upload_to="evidence/%Y/%m/")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="evidence_uploaded"
    )
    notes = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name_plural = "evidence"

    def __str__(self):
        return f"Evidence #{self.pk} for REC-{self.recommendation_id}"


class VerificationDecision(models.Model):
    """Internal audit's verdict on submitted evidence.

    For insufficient/partial decisions the structured fields answer: what was
    rejected, why, who must act, what is required next, and by when.
    """

    class Decision(models.TextChoices):
        SUFFICIENT = "sufficient", "Sufficient - close"
        PARTIAL = "partial", "Partial - stays open"
        INSUFFICIENT = "insufficient", "Insufficient - returned"

    recommendation = models.ForeignKey(
        "audits.Recommendation", on_delete=models.CASCADE, related_name="verifications"
    )
    decision = models.CharField(max_length=15, choices=Decision.choices)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="verifications_made"
    )
    notes = models.TextField(blank=True)
    # Structured feedback, mandatory when decision != sufficient:
    rejected_items = models.TextField(blank=True, help_text="What was rejected.")
    rejection_reason = models.TextField(blank=True, help_text="Why it was rejected.")
    required_action = models.TextField(blank=True, help_text="What is required next.")
    action_deadline = models.DateField(null=True, blank=True, help_text="Deadline to act.")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="verification_actions_assigned",
        help_text="Who must act.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_decision_display()} for REC-{self.recommendation_id}"
