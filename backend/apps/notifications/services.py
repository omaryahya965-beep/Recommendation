"""Reminder engine.

Evaluates every enabled ReminderRule against active recommendations daily.
Idempotency: each (rule, recommendation, recipient, date) produces one
deterministic dedupe_key; re-running the job can never create duplicates
(enforced by a DB unique constraint on Notification.dedupe_key).

Overdue is computed dynamically from the plan target date — it is never a
stored workflow state.
"""
from django.db import IntegrityError
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.organizations.models import Municipality

from .models import Notification, ReminderRule

S = Recommendation.Status

# Statuses where the deadline is still the employee's problem.
EXECUTION_STATUSES = (S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)

DEFAULT_RULE_OFFSETS = (-14, -7, -3, -1, 0, 1, 7, 14)
DEFAULT_ESCALATION_OFFSETS = (1, 7, 14)


def ensure_default_rules(municipality):
    """Seed the editable default schedule. Never overwrites existing rules."""
    created = 0
    for offset in DEFAULT_RULE_OFFSETS:
        _, was_created = ReminderRule.objects.get_or_create(
            municipality=municipality,
            offset_days=offset,
            recipient_role=ReminderRule.RecipientRole.EMPLOYEE,
        )
        created += was_created
    for offset in DEFAULT_ESCALATION_OFFSETS:
        _, was_created = ReminderRule.objects.get_or_create(
            municipality=municipality,
            offset_days=offset,
            recipient_role=ReminderRule.RecipientRole.AUDIT,
        )
        created += was_created
    return created


def _notification_type(offset_days):
    if offset_days < 0:
        return Notification.Type.DEADLINE_APPROACHING
    if offset_days == 0:
        return Notification.Type.DUE_TODAY
    return Notification.Type.OVERDUE


def _recipients(rule, recommendation):
    plan = getattr(recommendation, "action_plan", None)
    if rule.recipient_role == ReminderRule.RecipientRole.EMPLOYEE:
        return [plan.responsible_employee] if plan else []
    if rule.recipient_role == ReminderRule.RecipientRole.DEPARTMENT_HEAD:
        return list(
            User.objects.filter(
                role=User.Role.DEPARTMENT_HEAD,
                department=recommendation.report.department,
                is_active=True,
            )
        )
    return list(
        User.objects.filter(
            role=User.Role.AUDIT,
            municipality=recommendation.report.municipality,
            is_active=True,
        )
    )


def _message(offset_days, recommendation, target_date):
    snippet = recommendation.text[:80]
    if offset_days < 0:
        return f"تذكير: يتبقى {-offset_days} يوم/أيام على الموعد المستهدف ({target_date}) للتوصية: {snippet}"
    if offset_days == 0:
        return f"اليوم هو الموعد المستهدف ({target_date}) للتوصية: {snippet}"
    return f"متأخرة: انقضى {offset_days} يوم/أيام على الموعد المستهدف ({target_date}) للتوصية: {snippet}"


def _create(user, recommendation, ntype, message, dedupe_key):
    try:
        _, created = Notification.objects.get_or_create(
            dedupe_key=dedupe_key,
            defaults={
                "user": user,
                "recommendation": recommendation,
                "type": ntype,
                "message": message,
            },
        )
        return created
    except IntegrityError:
        return False


def run_reminders(today=None):
    """Returns the number of notifications created. Safe to run repeatedly."""
    today = today or timezone.localdate()
    created = 0

    for municipality in Municipality.objects.all():
        rules = list(municipality.reminder_rules.filter(enabled=True))
        if not rules:
            continue

        # --- Action plan deadlines -------------------------------------
        recommendations = (
            Recommendation.objects.filter(
                report__municipality=municipality,
                status__in=EXECUTION_STATUSES,
                action_plan__isnull=False,
            )
            .select_related("action_plan__responsible_employee", "report__department")
        )
        for rec in recommendations:
            target = rec.action_plan.target_date
            delta = (today - target).days
            for rule in rules:
                if rule.offset_days != delta:
                    continue
                ntype = _notification_type(rule.offset_days)
                message = _message(rule.offset_days, rec, target)
                for user in _recipients(rule, rec):
                    key = f"rule:{rule.id}:rec:{rec.id}:user:{user.id}:{today}"
                    created += _create(user, rec, ntype, message, key)

        # --- Management response deadlines ------------------------------
        # The same configurable offsets apply, using department_head rules.
        head_rules = [
            r for r in rules
            if r.recipient_role == ReminderRule.RecipientRole.DEPARTMENT_HEAD
        ]
        if head_rules:
            reports = AuditReport.objects.filter(
                municipality=municipality,
                status=AuditReport.Status.PENDING_RESPONSE,
                response_deadline__isnull=False,
            ).select_related("department")
            for report in reports:
                delta = (today - report.response_deadline).days
                pending = report.recommendations.filter(status=S.PENDING_RESPONSE)
                if not pending.exists():
                    continue
                for rule in head_rules:
                    if rule.offset_days != delta:
                        continue
                    heads = User.objects.filter(
                        role=User.Role.DEPARTMENT_HEAD,
                        department=report.department,
                        is_active=True,
                    )
                    for user in heads:
                        key = f"rule:{rule.id}:report:{report.id}:user:{user.id}:{today}"
                        message = (
                            f"تذكير بموعد الرد ({report.response_deadline}) "
                            f"على التقرير: {report.title}"
                        )
                        created += _create(
                            user, None, Notification.Type.RESPONSE_NEEDED, message, key
                        )
    return created
