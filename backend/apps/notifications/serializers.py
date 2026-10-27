from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework import serializers

from apps.audits.serializers import is_overdue
from apps.workflow.presentation import binding_deadline

from .models import Notification, ReminderRule
from .services import MAX_REMINDER_OFFSET_DAYS


def _rec(obj):
    return getattr(obj, "recommendation", None)


def _plan(rec):
    if rec is None:
        return None
    try:
        return rec.action_plan
    except ObjectDoesNotExist:
        return None


class NotificationSerializer(serializers.ModelSerializer):
    """Read-only. Extra recommendation fields are sourced from the related
    case so the inbox can show context without a second request. They are
    additive — existing clients that ignore unknown keys keep working."""

    recommendation_text = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    report_title = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    risk_level = serializers.SerializerMethodField()
    target_date = serializers.SerializerMethodField()
    responsible_employee = serializers.SerializerMethodField()
    overdue = serializers.SerializerMethodField()
    # The binding deadline (plan date, or the audit-set date after a partial or
    # insufficient verification — W1) and how late the department is (W2),
    # so the inbox never recounts lateness from the plan date.
    deadline = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "recommendation",
            "report",
            "recommendation_text",
            "department_name",
            "report_title",
            "status",
            "risk_level",
            "target_date",
            "responsible_employee",
            "overdue",
            "deadline",
            "days_overdue",
            "type",
            "message_key",
            "message_params",
            "message",
            "is_read",
            "sent_at",
        ]
        read_only_fields = fields

    def get_recommendation_text(self, obj):
        # The title, not the full stored text: the inbox shows one line.
        from apps.audits.finding import case_title

        rec = _rec(obj)
        return case_title(rec.text) if rec else None

    def get_department_name(self, obj):
        rec = _rec(obj)
        if rec is not None:
            return rec.report.department.name
        return obj.report.department.name if obj.report_id else None

    def get_report_title(self, obj):
        rec = _rec(obj)
        if rec is not None:
            return rec.report.title
        return obj.report.title if obj.report_id else None

    def get_status(self, obj):
        rec = _rec(obj)
        return rec.status if rec else None

    def get_risk_level(self, obj):
        rec = _rec(obj)
        return rec.risk_level if rec else None

    def get_target_date(self, obj):
        plan = _plan(_rec(obj))
        return plan.target_date if plan else None

    def get_responsible_employee(self, obj):
        plan = _plan(_rec(obj))
        if plan is None:
            return None
        return plan.responsible_employee.full_name_ar or plan.responsible_employee.username

    def get_overdue(self, obj):
        rec = _rec(obj)
        return is_overdue(rec) if rec else False

    def get_deadline(self, obj):
        rec = _rec(obj)
        return binding_deadline(rec)[0] if rec else None

    def get_days_overdue(self, obj):
        rec = _rec(obj)
        if rec is None or not is_overdue(rec):
            return 0
        deadline = binding_deadline(rec)[0]
        return (timezone.localdate() - deadline).days if deadline else 0


class ReminderRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderRule
        fields = ["id", "municipality", "offset_days", "enabled", "recipient_role", "label"]
        read_only_fields = ["id", "municipality"]

    def validate_offset_days(self, value):
        if abs(value) > MAX_REMINDER_OFFSET_DAYS:
            raise serializers.ValidationError(
                f"Use at most {MAX_REMINDER_OFFSET_DAYS} days before or after the deadline.",
                code="offset_out_of_range",
            )
        return value

    def validate(self, attrs):
        request = self.context["request"]
        offset = attrs.get("offset_days", getattr(self.instance, "offset_days", None))
        role = attrs.get("recipient_role", getattr(self.instance, "recipient_role", None))
        qs = ReminderRule.objects.filter(
            municipality=request.user.municipality, offset_days=offset, recipient_role=role
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "A rule with this offset and recipient already exists."
            )
        return attrs
