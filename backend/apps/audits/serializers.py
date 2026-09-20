from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer
from apps.workflow.serializers import (
    ActionPlanSerializer,
    ApprovalRecordSerializer,
    EvidenceSerializer,
    ManagementResponseSerializer,
    VerificationDecisionSerializer,
)

from .models import OVERDUE_ACTIVE_STATUSES, AuditReport, Recommendation


def is_overdue(recommendation):
    """Overdue is ALWAYS computed dynamically from the plan deadline —
    it is never a stored workflow state.

    Reads the same status list as the `overdue` query filter
    (`OVERDUE_ACTIVE_STATUSES`), so a badge can never contradict the filter
    that produced the row.
    """
    plan = getattr(recommendation, "action_plan", None)
    if plan is None or plan.target_date is None:
        return False
    if recommendation.status not in OVERDUE_ACTIVE_STATUSES:
        return False
    return plan.target_date < timezone.localdate()


class RecommendationListSerializer(serializers.ModelSerializer):
    report_title = serializers.CharField(source="report.title", read_only=True)
    department_name = serializers.CharField(source="report.department.name", read_only=True)
    department = serializers.IntegerField(source="report.department_id", read_only=True)
    # Report type (assurance / advisory) travels with every recommendation so
    # lists and the case header can show it without a second request.
    engagement_type = serializers.CharField(source="report.engagement_type", read_only=True)
    target_date = serializers.DateField(source="action_plan.target_date", read_only=True, default=None)
    responsible_employee = serializers.CharField(
        source="action_plan.responsible_employee.full_name_ar", read_only=True, default=None
    )
    overdue = serializers.SerializerMethodField()

    class Meta:
        model = Recommendation
        fields = [
            "id", "report", "report_title", "engagement_type", "department", "department_name",
            "text", "risk_level", "priority_score", "status", "is_recurring",
            "recurrence_confirmed", "target_date", "responsible_employee",
            "overdue", "created_at",
        ]
        read_only_fields = fields

    def get_overdue(self, obj):
        return is_overdue(obj)


class TrailEntrySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    action = serializers.CharField()
    user = serializers.CharField(source="user.username")
    user_full_name = serializers.CharField(source="user.full_name_ar")
    user_role = serializers.CharField(source="user.role")
    metadata = serializers.JSONField()
    created_at = serializers.DateTimeField()


class RecommendationDetailSerializer(RecommendationListSerializer):
    response = ManagementResponseSerializer(read_only=True)
    action_plan = ActionPlanSerializer(read_only=True)
    approvals = ApprovalRecordSerializer(many=True, read_only=True)
    evidence_files = EvidenceSerializer(many=True, read_only=True)
    verifications = VerificationDecisionSerializer(many=True, read_only=True)
    trail = TrailEntrySerializer(source="trail_entries", many=True, read_only=True)
    similar_recommendation_text = serializers.SerializerMethodField()

    class Meta(RecommendationListSerializer.Meta):
        fields = RecommendationListSerializer.Meta.fields + [
            "root_cause", "resolution", "similar_recommendation",
            "similar_recommendation_text", "similarity_score",
            "response", "action_plan", "approvals", "evidence_files",
            "verifications", "trail", "updated_at",
        ]
        read_only_fields = fields

    def get_similar_recommendation_text(self, obj):
        other = obj.similar_recommendation
        if other is None:
            return None
        from apps.audits.finding import brief_excerpt
        return brief_excerpt(other.text)


class RecommendationCreateSerializer(serializers.ModelSerializer):
    # The auditor owns this number. It is deliberately NOT derived from the AI
    # suggestion; bounds are enforced here and by a DB CHECK constraint.
    priority_score = serializers.IntegerField(
        required=False, min_value=0, max_value=100, default=0
    )

    class Meta:
        model = Recommendation
        fields = ["id", "report", "text", "root_cause", "risk_level", "priority_score"]

    def validate_text(self, value):
        if not (value or "").strip():
            raise serializers.ValidationError("Recommendation text is required.")
        return value

    def validate_report(self, report):
        user = self.context["request"].user
        if report.municipality_id != user.municipality_id:
            raise serializers.ValidationError("Report belongs to another municipality.")
        if report.status != AuditReport.Status.DRAFT:
            raise serializers.ValidationError(
                "Recommendations can only be added while the report is a draft."
            )
        return report


class AuditReportSerializer(serializers.ModelSerializer):
    created_by_detail = UserSerializer(source="created_by", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    recommendations_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AuditReport
        fields = [
            "id", "municipality", "department", "department_name", "title",
            "engagement_type", "status", "created_by", "created_by_detail",
            "response_deadline", "council_approval_date",
            "recommendations_count", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "municipality", "status", "created_by", "created_by_detail",
            "council_approval_date", "recommendations_count", "created_at", "updated_at",
        ]

    def validate_department(self, department):
        user = self.context["request"].user
        if department.municipality_id != user.municipality_id:
            raise serializers.ValidationError("Department belongs to another municipality.")
        return department


class AuditReportDetailSerializer(AuditReportSerializer):
    recommendations = serializers.SerializerMethodField()

    class Meta(AuditReportSerializer.Meta):
        fields = AuditReportSerializer.Meta.fields + ["recommendations"]

    @extend_schema_field(RecommendationListSerializer(many=True))
    def get_recommendations(self, report):
        """Only the recommendations this user may see.

        Nesting the related manager directly would hand an employee every
        recommendation in the report — including colleagues' items and audit's
        unissued drafts — regardless of the queryset scoping on the list view.
        """
        from apps.core.permissions import scope_recommendations

        request = self.context.get("request")
        queryset = Recommendation.objects.filter(report=report).select_related(
            "report__department", "action_plan__responsible_employee"
        )
        if request is not None and request.user.is_authenticated:
            queryset = scope_recommendations(queryset, request.user)
        return RecommendationListSerializer(
            queryset, many=True, context=self.context
        ).data
