from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import log_action
from apps.core.permissions import IsAudit

from .models import Notification, ReminderRule
from .serializers import NotificationSerializer, ReminderRuleSerializer


class NotificationViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["is_read", "type"]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).select_related(
            "recommendation__report__department",
            "recommendation__action_plan__responsible_employee",
        )

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"marked_read": updated})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(is_read=False).count()})


class ReminderRuleViewSet(viewsets.ModelViewSet):
    """Fully configurable reminder rules — add/edit/remove/toggle from the
    audit UI with no schema change."""

    serializer_class = ReminderRuleSerializer
    permission_classes = [IsAudit]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return ReminderRule.objects.filter(municipality=self.request.user.municipality)

    def perform_create(self, serializer):
        rule = serializer.save(municipality=self.request.user.municipality)
        log_action(
            self.request.user, "reminder_rule_created",
            offset_days=rule.offset_days, recipient_role=rule.recipient_role,
        )

    def perform_update(self, serializer):
        rule = serializer.save()
        log_action(
            self.request.user, "reminder_rule_updated",
            rule_id=rule.id, offset_days=rule.offset_days,
            recipient_role=rule.recipient_role, enabled=rule.enabled,
        )

    def perform_destroy(self, instance):
        log_action(
            self.request.user, "reminder_rule_deleted",
            rule_id=instance.id, offset_days=instance.offset_days,
            recipient_role=instance.recipient_role,
        )
        instance.delete()
