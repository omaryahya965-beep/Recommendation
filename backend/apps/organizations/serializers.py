from rest_framework import serializers

from .models import Department, Municipality, WorkflowPolicy


class MunicipalitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Municipality
        fields = ["id", "name"]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "municipality"]
        read_only_fields = ["municipality"]


class WorkflowPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowPolicy
        fields = [
            "id", "municipality", "require_plan_with_response",
        ]
        read_only_fields = ["id", "municipality"]
