from django.contrib.auth import get_user_model
from rest_framework.generics import CreateAPIView, ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core.permissions import IsAuditOrDepartmentHead

from .serializers import (
    ChangePasswordSerializer,
    RoleTokenObtainPairSerializer,
    SafeTokenRefreshSerializer,
    UserSerializer,
)

User = get_user_model()


class LoginView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer


class RefreshView(TokenRefreshView):
    serializer_class = SafeTokenRefreshSerializer


class MeView(RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(CreateAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=204)


class EmployeeListView(ListAPIView):
    """Employees available for action plan assignment.

    Department heads see their own department's employees; audit sees all
    employees in the municipality (filterable by department).
    """

    serializer_class = UserSerializer
    permission_classes = [IsAuditOrDepartmentHead]
    filterset_fields = ["department"]

    def get_queryset(self):
        qs = User.objects.filter(
            role=User.Role.EMPLOYEE,
            municipality=self.request.user.municipality,
            is_active=True,
        ).select_related("department", "municipality")
        if self.request.user.role == User.Role.DEPARTMENT_HEAD:
            qs = qs.filter(department=self.request.user.department)
        return qs
