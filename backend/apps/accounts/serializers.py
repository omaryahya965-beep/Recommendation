from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer

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
        read_only_fields = [field for field in fields if field != "email"]
        extra_kwargs = {"email": {"required": False, "allow_blank": True}}


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "The new passwords do not match."}
            )
        validate_password(attrs["new_password"], self.context["request"].user)
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


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


class SafeTokenRefreshSerializer(TokenRefreshSerializer):
    """SimpleJWT looks up the token's user with `.get()` and otherwise 500s
    when that row is gone (re-seed, restored DB, leftover browser tokens)."""

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except get_user_model().DoesNotExist as exc:
            raise AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            ) from exc
