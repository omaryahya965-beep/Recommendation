from rest_framework import mixins, viewsets
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.permissions import IsAudit, RolePermission

from .models import FollowUpReport
from .serializers import FollowUpReportSerializer, GenerateFollowUpSerializer
from .services import generate_followup_report


class CanViewFollowUps(RolePermission):
    allowed_roles = (User.Role.AUDIT, User.Role.COUNCIL, User.Role.DEPARTMENT_HEAD)


class FollowUpReportViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = FollowUpReportSerializer
    permission_classes = [CanViewFollowUps]

    def get_queryset(self):
        return FollowUpReport.objects.filter(
            municipality=self.request.user.municipality
        ).select_related("generated_by")

    @action(detail=False, methods=["post"], permission_classes=[IsAudit])
    def generate(self, request):
        serializer = GenerateFollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = generate_followup_report(
            request.user.municipality,
            request.user,
            serializer.validated_data["period_start"],
            serializer.validated_data["period_end"],
        )
        return Response(
            FollowUpReportSerializer(report).data, status=http_status.HTTP_201_CREATED
        )
