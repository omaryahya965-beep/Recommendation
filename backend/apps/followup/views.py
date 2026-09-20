from rest_framework import mixins, viewsets
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.permissions import IsAudit, RolePermission

from .models import FollowUpReport
from .serializers import FollowUpReportSerializer, GenerateFollowUpSerializer
from .services import generate_followup_report, preview_followup_report


class CanViewFollowUps(RolePermission):
    allowed_roles = (User.Role.AUDIT, User.Role.COUNCIL, User.Role.DEPARTMENT_HEAD)


class FollowUpReportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = FollowUpReportSerializer
    permission_classes = [CanViewFollowUps]

    def get_permissions(self):
        if self.action in ("generate", "preview"):
            return [IsAudit()]
        return super().get_permissions()

    def get_queryset(self):
        return FollowUpReport.objects.filter(
            municipality=self.request.user.municipality
        ).select_related("generated_by", "municipality")

    def _bounds(self, request):
        serializer = GenerateFollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return (
            serializer.validated_data["period_start"],
            serializer.validated_data["period_end"],
            (request.data.get("language") or "ar"),
        )

    @action(detail=False, methods=["post"], permission_classes=[IsAudit])
    def preview(self, request):
        """Compute the period's numbers without storing anything."""
        period_start, period_end, language = self._bounds(request)
        preview = preview_followup_report(
            request.user.municipality, period_start, period_end, language
        )
        preview["period_start"] = str(preview["period_start"])
        preview["period_end"] = str(preview["period_end"])
        return Response(preview, status=http_status.HTTP_200_OK)

    @action(detail=False, methods=["post"], permission_classes=[IsAudit])
    def generate(self, request):
        """Freeze the period into a stored, retrievable FollowUpReport."""
        period_start, period_end, language = self._bounds(request)
        report = generate_followup_report(
            request.user.municipality, request.user, period_start, period_end, language
        )
        return Response(
            FollowUpReportSerializer(report, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )
