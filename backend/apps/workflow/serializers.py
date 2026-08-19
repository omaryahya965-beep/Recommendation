import os

from django.conf import settings
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import (
    ActionPlan,
    ActionStep,
    ApprovalRecord,
    Evidence,
    ManagementResponse,
    VerificationDecision,
)


def validate_upload(file):
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file.size > max_bytes:
        raise serializers.ValidationError(
            f"File exceeds the maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB."
        )
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise serializers.ValidationError(
            f"File type '{ext}' is not allowed. Allowed: "
            + ", ".join(settings.ALLOWED_UPLOAD_EXTENSIONS)
        )
    return file


class ActionStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActionStep
        fields = [
            "id", "title", "order", "depends_on", "is_done", "progress_percent",
            "comments", "is_required_for_closure", "updated_at",
        ]
        read_only_fields = fields


class ActionPlanSerializer(serializers.ModelSerializer):
    steps = ActionStepSerializer(many=True, read_only=True)
    responsible_employee_detail = UserSerializer(source="responsible_employee", read_only=True)

    class Meta:
        model = ActionPlan
        fields = [
            "id", "recommendation", "responsible_employee", "responsible_employee_detail",
            "target_date", "notes", "status", "review_notes", "revision_count",
            "steps", "created_at", "updated_at",
        ]
        read_only_fields = fields


class ManagementResponseSerializer(serializers.ModelSerializer):
    submitted_by_detail = UserSerializer(source="submitted_by", read_only=True)

    class Meta:
        model = ManagementResponse
        fields = [
            "id", "recommendation", "decision", "justification", "attachment",
            "submitted_by", "submitted_by_detail", "review_status",
            "audit_review_notes", "revision_count", "created_at", "updated_at",
        ]
        read_only_fields = fields


class ApprovalRecordSerializer(serializers.ModelSerializer):
    approved_by_detail = UserSerializer(source="approved_by", read_only=True)

    class Meta:
        model = ApprovalRecord
        fields = ["id", "approval_type", "approved_by", "approved_by_detail", "notes", "created_at"]
        read_only_fields = fields


class EvidenceSerializer(serializers.ModelSerializer):
    uploaded_by_detail = UserSerializer(source="uploaded_by", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Evidence
        fields = [
            "id", "recommendation", "step", "file", "file_url", "uploaded_by",
            "uploaded_by_detail", "notes", "uploaded_at",
        ]
        read_only_fields = fields

    def get_file_url(self, obj):
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class VerificationDecisionSerializer(serializers.ModelSerializer):
    reviewed_by_detail = UserSerializer(source="reviewed_by", read_only=True)
    assigned_to_detail = UserSerializer(source="assigned_to", read_only=True)

    class Meta:
        model = VerificationDecision
        fields = [
            "id", "decision", "reviewed_by", "reviewed_by_detail", "notes",
            "rejected_items", "rejection_reason", "required_action",
            "action_deadline", "assigned_to", "assigned_to_detail", "created_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Input serializers for workflow actions
# ---------------------------------------------------------------------------
class ActionStepInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    order = serializers.IntegerField(required=False, min_value=0)
    comments = serializers.CharField(required=False, allow_blank=True)
    depends_on_index = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class ActionPlanInputSerializer(serializers.Serializer):
    responsible_employee = serializers.IntegerField()
    target_date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True)
    steps = ActionStepInputSerializer(many=True, required=False)


class RespondInputSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=ManagementResponse.Decision.choices)
    justification = serializers.CharField(required=False, allow_blank=True)
    attachment = serializers.FileField(required=False, allow_null=True, validators=[validate_upload])
    plan = ActionPlanInputSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["decision"] == ManagementResponse.Decision.DISAGREE:
            if not attrs.get("justification", "").strip():
                raise serializers.ValidationError(
                    {"justification": "Disagreement requires a written justification."}
                )
            if not attrs.get("attachment"):
                raise serializers.ValidationError(
                    {"attachment": "Disagreement requires a supporting attachment."}
                )
        return attrs


class ReviewInputSerializer(serializers.Serializer):
    accept = serializers.BooleanField()
    notes = serializers.CharField(required=False, allow_blank=True)


class StepProgressInputSerializer(serializers.Serializer):
    progress_percent = serializers.IntegerField(required=False, min_value=0, max_value=100)
    is_done = serializers.BooleanField(required=False)
    comments = serializers.CharField(required=False, allow_blank=True)


class EvidenceInputSerializer(serializers.Serializer):
    file = serializers.FileField(validators=[validate_upload])
    step = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class VerifyInputSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=VerificationDecision.Decision.choices)
    notes = serializers.CharField(required=False, allow_blank=True)
    rejected_items = serializers.CharField(required=False, allow_blank=True)
    rejection_reason = serializers.CharField(required=False, allow_blank=True)
    required_action = serializers.CharField(required=False, allow_blank=True)
    action_deadline = serializers.DateField(required=False, allow_null=True)
