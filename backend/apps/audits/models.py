from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class AuditReport(models.Model):
    class EngagementType(models.TextChoices):
        ADVISORY = "advisory", "Advisory"
        ASSURANCE = "assurance", "Assurance"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_RESPONSE = "pending_response", "Pending department response"
        UNDER_REVIEW = "under_review", "Under audit review"
        PENDING_COUNCIL = "pending_council", "Pending council ratification"
        RATIFIED = "ratified", "Ratified by council"

    municipality = models.ForeignKey(
        "organizations.Municipality", on_delete=models.CASCADE, related_name="reports"
    )
    department = models.ForeignKey(
        "organizations.Department", on_delete=models.CASCADE, related_name="reports"
    )
    title = models.CharField(max_length=255)
    engagement_type = models.CharField(max_length=20, choices=EngagementType.choices)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reports_created"
    )
    response_deadline = models.DateField(
        null=True, blank=True, help_text="Deadline for the department's management response."
    )
    # Anchor date for all reminders. Set ONLY upon council ratification
    # (COUNCIL_RATIFICATION ApprovalRecord), never on audit's internal approval.
    council_approval_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["municipality", "status"])]

    def __str__(self):
        return self.title


class Recommendation(models.Model):
    class RiskLevel(models.TextChoices):
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_RESPONSE = "pending_response", "Pending department response"
        AUDIT_REVIEW = "audit_review", "Response under audit review"
        RETURNED_FOR_REVISION = "returned_for_revision", "Returned to department for revision"
        PENDING_COUNCIL = "pending_council", "Pending council ratification"
        APPROVED_FOR_IMPLEMENTATION = "approved_for_implementation", "Approved for implementation"
        ACTION_PLAN_REQUIRED = "action_plan_required", "Action plan required"
        ACTION_PLAN_REVIEW = "action_plan_review", "Action plan under review"
        REVISION_REQUIRED = "revision_required", "Action plan revision required"
        ACTION_PLAN_APPROVED = "action_plan_approved", "Action plan approved"
        IN_PROGRESS = "in_progress", "In progress"
        PENDING_HEAD_REVIEW = "pending_head_review", "Pending department review of implementation"
        SUBMITTED_FOR_VERIFICATION = "submitted_for_verification", "Submitted for audit verification"
        RETURNED_INSUFFICIENT = "returned_insufficient", "Returned - insufficient evidence"
        PARTIAL = "partial", "Partially implemented"
        REOPENED = "reopened", "Reopened by council for further action"
        CLOSURE_REVIEW = "closure_review", "Recommendation closure review"
        PENDING_CLOSURE_COUNCIL = "pending_closure_council", "Pending council closure review"
        CLOSED = "closed", "Closed"

    class Resolution(models.TextChoices):
        IMPLEMENTED = "implemented", "Implemented and verified"
        DISAGREEMENT_ACCEPTED = "disagreement_accepted", "Disagreement accepted"

    report = models.ForeignKey(
        AuditReport, on_delete=models.CASCADE, related_name="recommendations"
    )
    text = models.TextField()
    root_cause = models.TextField(blank=True)
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)
    priority_score = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Auditor-set follow-up priority, 0-100. AI may suggest, never set.",
    )
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.DRAFT)
    resolution = models.CharField(
        max_length=30, choices=Resolution.choices, blank=True,
        help_text="Set when the recommendation reaches a terminal state.",
    )
    is_recurring = models.BooleanField(default=False)
    similar_recommendation = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="recurrences"
    )
    similarity_score = models.FloatField(null=True, blank=True)
    recurrence_confirmed = models.BooleanField(
        default=False, help_text="Human-in-the-loop confirmation by internal audit."
    )
    # Set when the recommendation reaches CLOSED. Needed so a follow-up report
    # for a past period can tell what was still open during that period;
    # updated_at is not a reliable closure timestamp.
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Portable embedding storage (list of floats + model id). Swappable for
    # pgvector on Neon without changing the similarity service interface.
    embedding = models.JSONField(null=True, blank=True)
    embedding_model = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-priority_score", "-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["risk_level"]),
            # Register/dashboard always filter by report then sort by priority.
            models.Index(fields=["report", "status"], name="rec_report_status_idx"),
            models.Index(
                fields=["-priority_score", "-created_at"], name="rec_priority_created_idx"
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(priority_score__gte=0, priority_score__lte=100),
                name="recommendation_priority_score_0_100",
            ),
        ]

    def __str__(self):
        return f"REC-{self.pk}: {self.text[:60]}"

    @property
    def municipality_id(self):
        return self.report.municipality_id

    @property
    def department_id(self):
        return self.report.department_id


# Statuses where an action-plan target date is still binding, so the case can
# be overdue. Single source of truth: the `overdue` API filter, the serializer's
# computed flag, and the dashboard counters all read this, so a filtered list
# can never disagree with the badge or the KPI above it.
OVERDUE_ACTIVE_STATUSES = (
    Recommendation.Status.IN_PROGRESS,
    Recommendation.Status.RETURNED_INSUFFICIENT,
    Recommendation.Status.PARTIAL,
    Recommendation.Status.REOPENED,
    Recommendation.Status.PENDING_HEAD_REVIEW,
    Recommendation.Status.SUBMITTED_FOR_VERIFICATION,
    Recommendation.Status.CLOSURE_REVIEW,
    Recommendation.Status.PENDING_CLOSURE_COUNCIL,
)

# Everything that is not finished and not an unissued draft.
OPEN_STATUSES = tuple(
    status
    for status, _ in Recommendation.Status.choices
    if status not in (Recommendation.Status.CLOSED, Recommendation.Status.DRAFT)
)
