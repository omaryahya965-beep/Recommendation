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

from .finding import brief_excerpt, case_title
from .models import AuditReport, Recommendation


def is_overdue(recommendation):
    """Department overdue, ALWAYS computed — never a stored workflow state.

    The binding deadline is the action-plan target date, or the audit-set
    deadline after a partial/insufficient verification (W1), and it only
    counts while the department owns the next action (W2). The `overdue`
    filter, dashboards, analytics and reminders use the same rules
    (apps.workflow.presentation), so a badge can never contradict the list
    or the KPI that produced it.
    """
    from apps.workflow.presentation import is_department_overdue

    return is_department_overdue(recommendation)


def _request_user(serializer):
    request = serializer.context.get("request")
    return getattr(request, "user", None)


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
    # Derived for display; `text` stays the stored contract.
    title = serializers.SerializerMethodField()
    excerpt = serializers.SerializerMethodField()
    # Where the case stands (apps.workflow.presentation).
    stage = serializers.SerializerMethodField()
    waiting_on = serializers.SerializerMethodField()
    next_role = serializers.SerializerMethodField()
    deadline = serializers.SerializerMethodField()
    deadline_source = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    due_in_days = serializers.SerializerMethodField()
    response_overdue = serializers.SerializerMethodField()
    days_waiting = serializers.SerializerMethodField()
    # When the case entered its current status: queues list newest first.
    waiting_since = serializers.SerializerMethodField()
    my_turn = serializers.SerializerMethodField()

    class Meta:
        model = Recommendation
        fields = [
            "id", "report", "report_title", "engagement_type", "department", "department_name",
            # `title`/`excerpt` only: the full stored text (often several KB)
            # is sent with the case detail, never with every list row.
            "title", "excerpt", "risk_level", "priority_score", "status", "resolution",
            "is_recurring", "recurrence_confirmed", "target_date", "responsible_employee",
            "overdue", "stage", "waiting_on", "next_role", "deadline", "deadline_source",
            "days_overdue", "due_in_days", "response_overdue", "days_waiting", "waiting_since",
            "my_turn", "created_at", "closed_at",
        ]
        read_only_fields = fields

    @staticmethod
    def _facts(obj):
        from apps.workflow.presentation import facts

        return facts(obj)

    def get_overdue(self, obj):
        return self._facts(obj)["is_overdue"]

    def get_title(self, obj):
        return case_title(obj.text)

    def get_excerpt(self, obj):
        return brief_excerpt(obj.text, 200)

    def get_stage(self, obj):
        return self._facts(obj)["stage"]

    def get_waiting_on(self, obj):
        return self._facts(obj)["waiting_on"]

    def get_next_role(self, obj):
        return self._facts(obj)["next_role"]

    def get_deadline(self, obj):
        deadline = self._facts(obj)["deadline"]
        return deadline.isoformat() if deadline else None

    def get_deadline_source(self, obj):
        return self._facts(obj)["deadline_source"]

    def get_days_overdue(self, obj):
        return self._facts(obj)["days_overdue"]

    def get_due_in_days(self, obj):
        return self._facts(obj)["due_in_days"]

    def get_response_overdue(self, obj):
        return self._facts(obj)["response_overdue"]

    def get_days_waiting(self, obj):
        return self._facts(obj)["days_waiting"]

    def get_waiting_since(self, obj):
        since = self._facts(obj)["waiting_since"]
        return since.isoformat() if since else None

    def get_my_turn(self, obj):
        from apps.workflow.presentation import is_my_turn

        user = _request_user(self)
        return bool(user and user.is_authenticated and is_my_turn(obj, user))


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
    workflow = serializers.SerializerMethodField()
    reminders = serializers.SerializerMethodField()

    class Meta(RecommendationListSerializer.Meta):
        fields = RecommendationListSerializer.Meta.fields + [
            "text", "root_cause", "similar_recommendation",
            "similar_recommendation_text", "similarity_score",
            "response", "action_plan", "approvals", "evidence_files",
            "verifications", "trail", "workflow", "reminders", "updated_at",
        ]
        read_only_fields = fields

    def get_reminders(self, obj):
        """Reminders the engine sent on this case (superseded ones omitted)."""
        sent = [
            dispatch for dispatch in obj.reminder_dispatches.all()
            if dispatch.outcome == "sent"
        ]
        return [
            {
                "id": dispatch.id,
                "recipient": dispatch.recipient.full_name_ar or dispatch.recipient.username,
                "recipient_role": dispatch.recipient_role,
                "offset_days": dispatch.offset_days,
                "anchor": dispatch.anchor,
                "deadline": dispatch.deadline.isoformat(),
                "sent_at": dispatch.created_at.isoformat(),
            }
            for dispatch in sorted(sent, key=lambda item: item.created_at, reverse=True)
        ]

    def get_workflow(self, obj):
        """Stage, owner, deadline, overdue and the actions this user may take
        now — computed by the same guards the endpoints enforce."""
        from apps.workflow.presentation import workflow_block

        user = _request_user(self)
        if user is None or not user.is_authenticated:
            return None
        return workflow_block(obj, user)

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


class RecommendationUpdateSerializer(serializers.ModelSerializer):
    """Edits an unissued draft. The report is fixed once the draft exists;
    whether editing is allowed at all is decided in the view (draft only)."""

    priority_score = serializers.IntegerField(required=False, min_value=0, max_value=100)

    class Meta:
        model = Recommendation
        fields = ["id", "text", "root_cause", "risk_level", "priority_score"]
        read_only_fields = ["id"]

    def validate_text(self, value):
        if not (value or "").strip():
            raise serializers.ValidationError("Recommendation text is required.")
        return value


class ReportRecommendationSerializer(RecommendationListSerializer):
    """A recommendation as listed inside its report. Adds the department's
    response decision so the council can see, before ratifying, which
    disagreements its ratification will close."""

    response_decision = serializers.CharField(
        source="response.decision", read_only=True, default=None
    )

    class Meta(RecommendationListSerializer.Meta):
        fields = RecommendationListSerializer.Meta.fields + ["response_decision"]
        read_only_fields = fields


class AuditReportSerializer(serializers.ModelSerializer):
    created_by_detail = UserSerializer(source="created_by", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    recommendations_count = serializers.IntegerField(read_only=True)
    # Every recommendation reviewed and approved for council (the same rule
    # as the audit dashboard's "ready for council" block).
    ready_for_council = serializers.SerializerMethodField()

    class Meta:
        model = AuditReport
        fields = [
            "id", "municipality", "department", "department_name", "title",
            "engagement_type", "status", "created_by", "created_by_detail",
            "response_deadline", "council_approval_date",
            "recommendations_count", "ready_for_council", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "municipality", "status", "created_by", "created_by_detail",
            "council_approval_date", "recommendations_count", "created_at", "updated_at",
        ]

    def get_ready_for_council(self, report):
        if report.status != AuditReport.Status.UNDER_REVIEW:
            return False
        total = getattr(report, "recommendations_count", None)
        gate = getattr(report, "at_council_gate", None)
        if total is None or gate is None:
            total = report.recommendations.count()
            gate = report.recommendations.filter(status=Recommendation.Status.PENDING_COUNCIL).count()
        return total > 0 and gate == total

    def validate_department(self, department):
        user = self.context["request"].user
        if department.municipality_id != user.municipality_id:
            raise serializers.ValidationError("Department belongs to another municipality.")
        return department


class AuditReportDetailSerializer(AuditReportSerializer):
    recommendations = serializers.SerializerMethodField()

    class Meta(AuditReportSerializer.Meta):
        fields = AuditReportSerializer.Meta.fields + ["recommendations"]

    @extend_schema_field(ReportRecommendationSerializer(many=True))
    def get_recommendations(self, report):
        """Only the recommendations this user may see.

        Nesting the related manager directly would hand an employee every
        recommendation in the report — including colleagues' items and audit's
        unissued drafts — regardless of the queryset scoping on the list view.
        """
        from apps.core.permissions import scope_recommendations

        request = self.context.get("request")
        queryset = Recommendation.objects.filter(report=report).select_related(
            "report__department", "action_plan__responsible_employee", "response"
        )
        if request is not None and request.user.is_authenticated:
            queryset = scope_recommendations(queryset, request.user)
        from apps.workflow.presentation import annotate_workflow

        queryset = annotate_workflow(queryset)
        return ReportRecommendationSerializer(
            queryset, many=True, context=self.context
        ).data
