from django.contrib.auth import get_user_model
from rest_framework.generics import CreateAPIView, ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core.permissions import IsAuditOrDepartmentHead


class LoginRateThrottle(ScopedRateThrottle):
    """Throttle by client IP even before a user is identified.

    The default ScopedRateThrottle keys on the authenticated user, which is
    useless on a login endpoint: an attacker is by definition unauthenticated.
    """

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }

from .serializers import (
    ChangePasswordSerializer,
    RoleTokenObtainPairSerializer,
    SafeTokenRefreshSerializer,
    UserSerializer,
)

User = get_user_model()


class LoginView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer
    # Credential stuffing protection. Keyed per client by ScopedRateThrottle.
    throttle_classes = [LoginRateThrottle]
    throttle_scope = "login"


class RefreshView(TokenRefreshView):
    """Routed at /api/auth/refresh/.

    Uses SafeTokenRefreshSerializer so a token whose user row has been deleted
    is rejected with 401 instead of raising User.DoesNotExist (HTTP 500).
    """

    serializer_class = SafeTokenRefreshSerializer
    throttle_classes = [LoginRateThrottle]
    throttle_scope = "login"


class LogoutView(APIView):
    """Revoke a refresh token so logout is more than deleting client storage.

    Blacklisting requires SimpleJWT's blacklist app; when it is unavailable the
    endpoint still succeeds (the client drops its tokens) rather than blocking
    logout, but it reports that the token was not revoked server-side.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw = (request.data or {}).get("refresh")
        if not raw:
            return Response({"revoked": False, "detail": "No refresh token supplied."})
        try:
            from rest_framework_simplejwt.tokens import RefreshToken

            RefreshToken(raw).blacklist()
        except Exception:
            # Already blacklisted, malformed, expired, or blacklist app absent.
            return Response({"revoked": False})
        return Response({"revoked": True})


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
