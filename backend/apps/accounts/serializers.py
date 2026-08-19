from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    municipality_name = serializers.CharField(source="municipality.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "full_name_ar", "first_name", "last_name", "email",
            "role", "department", "department_name", "municipality", "municipality_name",
        ]
        read_only_fields = fields


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT login response enriched with the user profile the frontend needs."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["municipality_id"] = user.municipality_id
        token["department_id"] = user.department_id
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
