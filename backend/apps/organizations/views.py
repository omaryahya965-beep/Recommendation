from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import log_action
from apps.core.permissions import IsAudit

from .models import Department, WorkflowPolicy
from .serializers import DepartmentSerializer, WorkflowPolicySerializer


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return Department.objects.filter(municipality=self.request.user.municipality)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update"):
            return [IsAudit()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(municipality=self.request.user.municipality)


class WorkflowPolicyView(APIView):
    """Any authenticated tenant user may read the policy (departments need to
    know whether the plan is required with the response); only audit edits."""

    permission_classes = [IsAuthenticated]

    def _get_policy(self, request):
        policy, _ = WorkflowPolicy.objects.get_or_create(
            municipality=request.user.municipality
        )
        return policy

    def get(self, request):
        return Response(WorkflowPolicySerializer(self._get_policy(request)).data)

    def patch(self, request):
        if not IsAudit().has_permission(request, self):
            return Response({"detail": "Audit role required."}, status=403)
        policy = self._get_policy(request)
        serializer = WorkflowPolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(request.user, "workflow_policy_updated", **serializer.validated_data)
        return Response(serializer.data)
