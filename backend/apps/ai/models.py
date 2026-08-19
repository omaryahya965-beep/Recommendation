from django.conf import settings
from django.db import models


class AIAnalysis(models.Model):
    """Cached, auditable AI decision-support output. Never a workflow action."""

    class AnalysisType(models.TextChoices):
        RECOMMENDATION = "recommendation", "Recommendation quality/risk analysis"
        SIMILARITY = "similarity", "Similarity / recurring findings"
        ACTION_PLAN = "action_plan", "Suggested action plan (draft)"
        EVIDENCE = "evidence", "Evidence advisory review"
        RISK = "risk", "Delay / problem risk estimate"
        SUMMARY = "summary", "Executive summary"
        INSIGHT = "insight", "Dashboard intelligence snapshot"

    analysis_type = models.CharField(max_length=30, choices=AnalysisType.choices)
    target_type = models.CharField(max_length=40)
    target_id = models.IntegerField()
    municipality = models.ForeignKey(
        "organizations.Municipality", on_delete=models.CASCADE, related_name="ai_analyses"
    )
    content_hash = models.CharField(max_length=64, db_index=True)
    provider = models.CharField(max_length=40)
    model = models.CharField(max_length=100)
    output = models.JSONField(default=dict)
    confidence = models.FloatField(null=True, blank=True)
    human_reviewed = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ai_analyses",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["analysis_type", "target_type", "target_id"]),
            models.Index(fields=["municipality", "analysis_type"]),
        ]

    def __str__(self):
        return f"{self.analysis_type} {self.target_type}:{self.target_id}"


class AIJob(models.Model):
    """Process record so long AI work can later move to Celery without API changes."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    job_type = models.CharField(max_length=40)
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.IntegerField(null=True, blank=True)
    analysis = models.ForeignKey(
        AIAnalysis, null=True, blank=True, on_delete=models.SET_NULL, related_name="jobs"
    )
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_jobs"
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AIConversation(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_conversations"
    )
    municipality = models.ForeignKey(
        "organizations.Municipality", on_delete=models.CASCADE, related_name="ai_conversations"
    )
    role = models.CharField(max_length=20)
    title = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class AIMessage(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"
        SYSTEM = "system", "System"

    conversation = models.ForeignKey(
        AIConversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=12, choices=Role.choices)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
