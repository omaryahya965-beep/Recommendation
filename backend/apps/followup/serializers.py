from rest_framework import serializers

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


class GenerateFollowUpSerializer(serializers.Serializer):
    period_start = serializers.DateField()
    period_end = serializers.DateField()

    def validate(self, attrs):
        if attrs["period_start"] > attrs["period_end"]:
            raise serializers.ValidationError("period_start must be before period_end.")
        return attrs
