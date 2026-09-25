from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        from django.db.models.signals import post_delete, post_save

        from apps.audits.models import AuditReport, Recommendation
        from apps.core.analytics import invalidate_analytics
        from apps.workflow.models import ActionPlan, ActionStep

        # Every model an analytics number is computed from: statuses, risk,
        # recurrence and dates (Recommendation), department, engagement type
        # and draft visibility (AuditReport), overdue (ActionPlan.target_date)
        # and step progress (ActionStep).
        for model in (Recommendation, AuditReport, ActionPlan, ActionStep):
            post_save.connect(invalidate_analytics, sender=model, dispatch_uid=f"analytics-{model.__name__}-save")
            post_delete.connect(invalidate_analytics, sender=model, dispatch_uid=f"analytics-{model.__name__}-delete")
