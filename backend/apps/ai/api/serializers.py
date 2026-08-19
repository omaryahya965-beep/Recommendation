from rest_framework import serializers


class SummaryRequestSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(
        choices=("recommendation", "department", "report", "municipality", "followup_period")
    )
    language = serializers.CharField(required=False, default="ar")
    recommendation_id = serializers.IntegerField(required=False)
    department_id = serializers.IntegerField(required=False)
    report_id = serializers.IntegerField(required=False)
    followup_report_id = serializers.IntegerField(required=False)
    period_start = serializers.DateField(required=False)
    period_end = serializers.DateField(required=False)


class AssistantRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=4000)
    language = serializers.CharField(required=False, default="ar")
    conversation_id = serializers.IntegerField(required=False)


class LanguageSerializer(serializers.Serializer):
    language = serializers.CharField(required=False, default="ar")
