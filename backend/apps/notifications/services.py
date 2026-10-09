"""Reminder engine (catch-up, idempotent).

Every enabled ReminderRule is a milestone relative to a deadline:
negative offsets are "N days before", 0 is "due today", positive are
"N days overdue". A milestone is due once `today >= deadline + offset`.

The engine never depends on running on one exact day. Each pass, for every
case and recipient, it finds the milestones that are due and have no
dispatch record yet:

* the latest such milestone is sent;
* earlier ones are recorded as `superseded` and never sent later, so a cron
  that missed a week produces one current reminder, not a burst, and a
  "3 days before" reminder is never sent after the deadline has passed.

Deduplication lives in ReminderDispatch, keyed by rule, case, recipient,
deadline source and deadline. Deleting a notification therefore never
triggers a re-send, and moving a deadline starts a new cycle.

Deadlines follow the workflow rules (apps.workflow.presentation): the
binding deadline (plan date, or the audit-set deadline after a
partial/insufficient verification, W1) while the department owns the next
action (W2), and the report's response deadline for each recommendation
still awaiting the department's response.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.finding import case_title
from apps.audits.models import DEPARTMENT_DEADLINE_STATUSES, Recommendation
from apps.core.arabic import date_ar, days
from apps.organizations.models import Municipality
from apps.core.refs import record_code

from .models import Notification, ReminderDispatch, ReminderRule, ReminderRun

logger = logging.getLogger("apps.notifications")

S = Recommendation.Status
Role = ReminderRule.RecipientRole

EXECUTION_STATUSES = (S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)
RESPONSE_STATUSES = (S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION)

DEFAULT_RULE_OFFSETS = (-14, -7, -3, -1, 0, 1, 7, 14)
DEFAULT_ESCALATION_OFFSETS = (1, 7, 14)
# The department head is reminded before a response is due and when the
# department's work runs late (W2: only while the department owns it).
DEFAULT_HEAD_OFFSETS = (-3, 0, 3, 7)

DEFAULT_RULES = (
    [(offset, Role.EMPLOYEE) for offset in DEFAULT_RULE_OFFSETS]
    + [(offset, Role.DEPARTMENT_HEAD) for offset in DEFAULT_HEAD_OFFSETS]
    + [(offset, Role.AUDIT) for offset in DEFAULT_ESCALATION_OFFSETS]
)


def missing_default_rules(municipality):
    existing = set(municipality.reminder_rules.values_list("offset_days", "recipient_role"))
    return [(offset, role) for offset, role in DEFAULT_RULES if (offset, role) not in existing]


def ensure_default_rules(municipality):
    """Seed the editable default schedule. Never overwrites existing rules."""
    created = 0
    for offset, role in missing_default_rules(municipality):
        _, was_created = ReminderRule.objects.get_or_create(
            municipality=municipality, offset_days=offset, recipient_role=role
        )
        created += was_created
    return created


# ---------------------------------------------------------------------------
# Recipients: who is reminded depends on who owns the next action.
# ---------------------------------------------------------------------------
def _heads(rec):
    return [
        user for user in User.objects.filter(
            role=User.Role.DEPARTMENT_HEAD, department_id=rec.report.department_id, is_active=True
        )
    ]


def _audit(rec, cache):
    key = rec.report.municipality_id
    if key not in cache:
        cache[key] = list(
            User.objects.filter(role=User.Role.AUDIT, municipality_id=key, is_active=True)
        )
    return cache[key]


def _recipients(role, rec, anchor, audit_cache):
    if role == Role.EMPLOYEE:
        # The employee is reminded only while executing; once submitted to
        # the head, or for response deadlines, it is not their action.
        if anchor == "response" or rec.status not in EXECUTION_STATUSES:
            return []
        plan = getattr(rec, "action_plan", None)
        employee = plan.responsible_employee if plan else None
        return [employee] if employee is not None and employee.is_active else []
    if role == Role.DEPARTMENT_HEAD:
        return _heads(rec)
    # Internal audit is an escalation: only once a deadline has passed.
    return _audit(rec, audit_cache)


def _type_for(delta, anchor):
    """`delta` is today minus the deadline in days (negative = days left)."""
    if anchor == "response" and delta < 0:
        return Notification.Type.RESPONSE_NEEDED
    if delta < 0:
        return Notification.Type.DEADLINE_APPROACHING
    if delta == 0:
        return Notification.Type.DUE_TODAY
    return Notification.Type.OVERDUE


def _message(rec, offset, anchor, deadline):
    """`offset` here is the actual distance from the deadline today, not the
    rule's nominal offset: a reminder sent late by catch-up must say how many
    days are really left."""
    title = case_title(rec.text, 80)
    ref = record_code(rec.id)
    what = {
        "plan": "موعد تنفيذ خطة العمل",
        "verification": "موعد استكمال العمل الذي حددته الرقابة",
        "response": "موعد رد الدائرة",
    }[anchor]
    if offset < 0:
        return f"تذكير: يتبقى {days(-offset)} على {what} ({date_ar(deadline)}) — «{title}» {ref}."
    if offset == 0:
        return f"اليوم هو {what} ({date_ar(deadline)}) — «{title}» {ref}."
    return f"متأخرة: مضى {days(offset)} على {what} ({date_ar(deadline)}) — «{title}» {ref}."


def _dispatch_key(rule, rec, user, anchor, deadline):
    return f"reminder:rule:{rule.id}:rec:{rec.id}:user:{user.id}:{anchor}:{deadline.isoformat()}"


def _legacy_sent(rule, rec, user, deadline):
    """Reminders sent by the earlier exact-day engine (date-keyed), so the
    switch to catch-up never repeats one that was already delivered."""
    day = deadline + timedelta(days=rule.offset_days)
    return Notification.objects.filter(
        dedupe_key=f"rule:{rule.id}:rec:{rec.id}:user:{user.id}:{day.isoformat()}"
    ).exists()


def _cases(municipality):
    """(case, anchor, deadline) for every case with a deadline someone owns."""
    from apps.workflow.presentation import annotate_workflow

    base = Recommendation.objects.filter(report__municipality=municipality).select_related(
        "report", "action_plan__responsible_employee"
    )
    executing = annotate_workflow(base.filter(status__in=DEPARTMENT_DEADLINE_STATUSES)).filter(
        binding_deadline__isnull=False
    )
    for rec in executing:
        returned = (
            rec.latest_verification_decision in ("partial", "insufficient")
            and rec.latest_verification_deadline
        )
        yield rec, "verification" if returned else "plan", rec.binding_deadline
    responding = base.filter(status__in=RESPONSE_STATUSES, report__response_deadline__isnull=False)
    for rec in responding:
        yield rec, "response", rec.report.response_deadline


def _process_case(rec, anchor, deadline, rules_by_role, today, run, audit_cache):
    sent = superseded = 0
    for role, rules in rules_by_role.items():
        if role == Role.AUDIT:
            rules = [rule for rule in rules if rule.offset_days > 0]
        due = [rule for rule in rules if today >= deadline + timedelta(days=rule.offset_days)]
        if not due:
            continue
        latest = max(due, key=lambda rule: rule.offset_days)
        for user in _recipients(role, rec, anchor, audit_cache):
            for rule in due:
                key = _dispatch_key(rule, rec, user, anchor, deadline)
                if ReminderDispatch.objects.filter(key=key).exists():
                    continue
                legacy = rule.offset_days == latest.offset_days and _legacy_sent(rule, rec, user, deadline)
                outcome = (
                    ReminderDispatch.Outcome.SENT
                    if rule is latest
                    else ReminderDispatch.Outcome.SUPERSEDED
                )
                notification = None
                if outcome == ReminderDispatch.Outcome.SENT and not legacy:
                    delta = (today - deadline).days
                    notification = Notification(
                        user=user,
                        recommendation=rec,
                        type=_type_for(delta, anchor),
                        message=_message(rec, delta, anchor, deadline),
                        dedupe_key=key,
                    )
                try:
                    with transaction.atomic():
                        if notification is not None:
                            notification.save()
                        ReminderDispatch.objects.create(
                            key=key,
                            rule=rule,
                            offset_days=rule.offset_days,
                            recipient_role=rule.recipient_role,
                            recommendation=rec,
                            recipient=user,
                            anchor=anchor,
                            deadline=deadline,
                            outcome=outcome,
                            notification=notification,
                            run=run,
                        )
                except IntegrityError:
                    # A concurrent run recorded the same milestone first.
                    continue
                if notification is not None:
                    sent += 1
                elif outcome == ReminderDispatch.Outcome.SUPERSEDED:
                    superseded += 1
    return sent, superseded


def run_reminders(today=None, trigger="command"):
    """One catch-up pass. Returns the number of reminders sent. Safe to run
    any number of times a day, and after any number of missed days."""
    today = today or timezone.localdate()
    run = ReminderRun.objects.create(trigger=trigger)
    sent = superseded = 0
    try:
        audit_cache = {}
        for municipality in Municipality.objects.all():
            rules_by_role = defaultdict(list)
            for rule in municipality.reminder_rules.filter(enabled=True):
                rules_by_role[rule.recipient_role].append(rule)
            if not rules_by_role:
                continue
            for rec, anchor, deadline in _cases(municipality):
                case_sent, case_superseded = _process_case(
                    rec, anchor, deadline, rules_by_role, today, run, audit_cache
                )
                sent += case_sent
                superseded += case_superseded
    except Exception as exc:
        ReminderRun.objects.filter(pk=run.pk).update(
            status=ReminderRun.Status.FAILED,
            finished_at=timezone.now(),
            sent=sent,
            superseded=superseded,
            error=f"{type(exc).__name__}: {exc}"[:2000],
        )
        logger.exception("reminder_run_failed run=%s", run.pk)
        raise
    ReminderRun.objects.filter(pk=run.pk).update(
        status=ReminderRun.Status.OK,
        finished_at=timezone.now(),
        sent=sent,
        superseded=superseded,
    )
    return sent


def reminder_status(municipality):
    """What the reminder settings page shows about the engine's health."""
    last = ReminderRun.objects.order_by("-started_at").first()
    last_ok = ReminderRun.objects.filter(status=ReminderRun.Status.OK).order_by("-started_at").first()
    healthy = bool(last_ok and timezone.now() - last_ok.started_at <= timedelta(hours=36))
    return {
        "healthy": healthy,
        "last_run": (
            {
                "started_at": last.started_at.isoformat(),
                "finished_at": last.finished_at.isoformat() if last.finished_at else None,
                "status": last.status,
                "trigger": last.trigger,
                "sent": last.sent,
                "superseded": last.superseded,
            }
            if last
            else None
        ),
        "last_success_at": last_ok.started_at.isoformat() if last_ok else None,
        "missing_defaults": len(missing_default_rules(municipality)),
    }
