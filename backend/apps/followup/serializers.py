from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer

from .models import FollowUpReport


class FollowUpReportSerializer(serializers.ModelSerializer):
    generated_by_detail = UserSerializer(source="generated_by", read_only=True)

    class Meta:
        model = FollowUpReport
        fields = [
            "id", "municipality", "period_start", "period_end",
            "generated_by", "generated_by_detail", "snapshot",
            "executive_summary", "language", "generated_file", "created_at",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == User.Role.DEPARTMENT_HEAD:
            # S11: a department head sees their own department only; the
            # municipality-wide narrative names other departments.
            from .services import department_view

            data["snapshot"] = department_view(instance.snapshot or {}, user.department)
            data["executive_summary"] = None
        return data


class GenerateFollowUpSerializer(serializers.Serializer):
    period_start = serializers.DateField()
    period_end = serializers.DateField()

    def validate(self, attrs):
        if attrs["period_start"] > attrs["period_end"]:
            raise serializers.ValidationError("period_start must be before period_end.", code="period_order")
        return attrs
