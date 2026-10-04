"""How a recommendation is presented: business stage, who it is waiting on,
its binding deadline and whether that deadline has passed.

The 19 statuses in `transitions.py` stay the source of truth for the
workflow. This module only describes them for people:

* ten business stages instead of nineteen technical statuses;
* who the case waits on now (the department, internal audit or the council)
  and since when (`waiting_since`, from the audit trail);
* the binding deadline (W1): the action-plan target date, replaced by the
  audit-set `action_deadline` after a partial/insufficient verification;
* department overdue (W2): only while the department owns the next action.
  Waiting on audit or the council is reported as queue age, never as the
  department being late.

Two implementations of the same rules: `annotate_workflow()` for querysets
(filters, counters, ordering) and `facts()` for one loaded case. Both read
the constants below; tests pin them to each other.
"""
from __future__ import annotations

from django.db.models import Case, DateField, F, OuterRef, Q, Subquery, Value, When
from django.db.models.fields.json import KT
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.models import (
    AUDIT_QUEUE_STATUSES,
    COUNCIL_QUEUE_STATUSES,
    DEPARTMENT_DEADLINE_STATUSES,
    RETURNED_WORK_DECISIONS,
    AuditReport,
    Recommendation,
)

from . import guards

S = Recommendation.Status
R = User.Role

# ---------------------------------------------------------------------------
# Business stages
# ---------------------------------------------------------------------------
STAGES = (
    {"id": "preparation", "ar": "إعداد التدقيق", "en": "Audit preparation"},
    {"id": "response", "ar": "رد الدائرة", "en": "Department response"},
    {"id": "audit_review", "ar": "مراجعة الرقابة", "en": "Audit review"},
    {"id": "council", "ar": "اعتماد المجلس", "en": "Council ratification"},
    {"id": "plan", "ar": "خطة العمل", "en": "Action plan"},
    {"id": "execution", "ar": "التنفيذ", "en": "Implementation"},
    {"id": "head_review", "ar": "مراجعة رئيس الدائرة", "en": "Head review"},
    {"id": "verification", "ar": "تحقق الرقابة", "en": "Audit verification"},
    {"id": "closure", "ar": "الإغلاق", "en": "Closure"},
    {"id": "closed", "ar": "مغلق", "en": "Closed"},
)
STAGE_IDS = tuple(stage["id"] for stage in STAGES)

STATUS_STAGE = {
    S.DRAFT: "preparation",
    S.PENDING_RESPONSE: "response",
    S.RETURNED_FOR_REVISION: "response",
    S.AUDIT_REVIEW: "audit_review",
    S.PENDING_COUNCIL: "council",
    S.APPROVED_FOR_IMPLEMENTATION: "council",
    S.ACTION_PLAN_REQUIRED: "plan",
    S.ACTION_PLAN_REVIEW: "plan",
    S.REVISION_REQUIRED: "plan",
    S.ACTION_PLAN_APPROVED: "plan",
    S.IN_PROGRESS: "execution",
    S.RETURNED_INSUFFICIENT: "execution",
    S.PARTIAL: "execution",
    S.REOPENED: "execution",
    S.PENDING_HEAD_REVIEW: "head_review",
    S.SUBMITTED_FOR_VERIFICATION: "verification",
    S.CLOSURE_REVIEW: "verification",
    S.PENDING_CLOSURE_COUNCIL: "closure",
    S.CLOSED: "closed",
}

# The plain-language label of every status, as users see it.
STATUS_LABELS = {
    S.DRAFT: {"ar": "مسودة لدى الرقابة", "en": "Audit draft"},
    S.PENDING_RESPONSE: {"ar": "بانتظار رد الدائرة", "en": "Awaiting department response"},
    S.RETURNED_FOR_REVISION: {"ar": "أُعيد الرد للتعديل", "en": "Response returned for revision"},
    S.AUDIT_REVIEW: {"ar": "بانتظار مراجعة الرقابة للرد", "en": "Response awaiting audit review"},
    S.PENDING_COUNCIL: {"ar": "بانتظار مصادقة المجلس", "en": "Awaiting council ratification"},
    S.APPROVED_FOR_IMPLEMENTATION: {"ar": "صودق عليها", "en": "Ratified"},
    S.ACTION_PLAN_REQUIRED: {"ar": "بانتظار خطة العمل من الدائرة", "en": "Awaiting the department's action plan"},
    S.ACTION_PLAN_REVIEW: {"ar": "بانتظار مراجعة الرقابة للخطة", "en": "Plan awaiting audit review"},
    S.REVISION_REQUIRED: {"ar": "أُعيدت الخطة للتعديل", "en": "Plan returned for revision"},
    S.ACTION_PLAN_APPROVED: {"ar": "اعتُمدت الخطة", "en": "Plan approved"},
    S.IN_PROGRESS: {"ar": "قيد التنفيذ", "en": "In progress"},
    S.RETURNED_INSUFFICIENT: {"ar": "مطلوب استكمال — أدلة غير كافية", "en": "More work needed — insufficient evidence"},
    S.PARTIAL: {"ar": "مطلوب استكمال — تنفيذ جزئي", "en": "More work needed — partially implemented"},
    S.REOPENED: {"ar": "أعاد المجلس فتحها", "en": "Reopened by the council"},
    S.PENDING_HEAD_REVIEW: {"ar": "بانتظار مراجعة رئيس الدائرة", "en": "Awaiting head review"},
    S.SUBMITTED_FOR_VERIFICATION: {"ar": "بانتظار تحقق الرقابة من الأدلة", "en": "Awaiting audit verification"},
    S.CLOSURE_REVIEW: {"ar": "تحقّق مكتمل — بانتظار الإحالة للمجلس", "en": "Verified — awaiting referral to the council"},
    S.PENDING_CLOSURE_COUNCIL: {"ar": "بانتظار قرار المجلس بالإغلاق", "en": "Awaiting the council's closure decision"},
    S.CLOSED: {"ar": "مغلقة", "en": "Closed"},
}

CLOSED_LABELS = {
    Recommendation.Resolution.IMPLEMENTED: {"ar": "مغلقة — نُفّذت", "en": "Closed — implemented"},
    Recommendation.Resolution.DISAGREEMENT_ACCEPTED: {
        "ar": "مغلقة — قُبل عدم الاتفاق",
        "en": "Closed — disagreement accepted",
    },
}

# Who acts next, by status. `pending_council` waits on audit until the report
# itself has been submitted to the council (see `waiting_on`).
NEXT_ROLE = {
    S.DRAFT: R.AUDIT,
    S.PENDING_RESPONSE: R.DEPARTMENT_HEAD,
    S.RETURNED_FOR_REVISION: R.DEPARTMENT_HEAD,
    S.AUDIT_REVIEW: R.AUDIT,
    S.PENDING_COUNCIL: R.COUNCIL,
    S.APPROVED_FOR_IMPLEMENTATION: R.DEPARTMENT_HEAD,
    S.ACTION_PLAN_REQUIRED: R.DEPARTMENT_HEAD,
    S.ACTION_PLAN_REVIEW: R.AUDIT,
    S.REVISION_REQUIRED: R.DEPARTMENT_HEAD,
    S.ACTION_PLAN_APPROVED: R.EMPLOYEE,
    S.IN_PROGRESS: R.EMPLOYEE,
    S.RETURNED_INSUFFICIENT: R.EMPLOYEE,
    S.PARTIAL: R.EMPLOYEE,
    S.REOPENED: R.EMPLOYEE,
    S.PENDING_HEAD_REVIEW: R.DEPARTMENT_HEAD,
    S.SUBMITTED_FOR_VERIFICATION: R.AUDIT,
    S.CLOSURE_REVIEW: R.AUDIT,
    S.PENDING_CLOSURE_COUNCIL: R.COUNCIL,
    S.CLOSED: None,
}

ROLE_SIDE = {
    R.AUDIT: "audit",
    R.COUNCIL: "council",
    R.DEPARTMENT_HEAD: "department",
    R.EMPLOYEE: "department",
}

# Statuses a reviewer sent backwards.
RETURNED_STATUSES = (S.RETURNED_FOR_REVISION, S.REVISION_REQUIRED, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)

# System waypoints that are left immediately; never offered as filters.
TRANSIENT_STATUSES = (S.APPROVED_FOR_IMPLEMENTATION, S.ACTION_PLAN_APPROVED)

RESPONSE_STATUSES = (S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION)

# Which offered action is "the" next step, in order of preference.
PRIMARY_ACTION_ORDER = (
    "respond",
    "review_response",
    "submit_plan",
    "review_plan",
    "review_implementation",
    "verify",
    "submit_for_closure",
    "council_closure",
    "mark_implemented",
    "upload_evidence",
    "update_progress",
    "edit_draft",
)


def stage_of(status: str) -> str:
    return STATUS_STAGE.get(status, "preparation")


def stage_index(status: str) -> int:
    """1-based position among the ten stages."""
    return STAGE_IDS.index(stage_of(status)) + 1


def status_label(status: str, resolution: str = "", language: str = "ar") -> str:
    if status == S.CLOSED and resolution in CLOSED_LABELS:
        return CLOSED_LABELS[resolution][language]
    labels = STATUS_LABELS.get(status)
    return labels[language] if labels else status


def statuses_for_stage(stage_id: str) -> list[str]:
    return [status for status, stage in STATUS_STAGE.items() if stage == stage_id]


# ---------------------------------------------------------------------------
# SQL: annotate a recommendation queryset with the same facts
# ---------------------------------------------------------------------------
def _binding_deadline_expression():
    return Case(
        When(
            status__in=DEPARTMENT_DEADLINE_STATUSES,
            latest_verification_decision__in=RETURNED_WORK_DECISIONS,
            latest_verification_deadline__isnull=False,
            then=F("latest_verification_deadline"),
        ),
        When(status__in=DEPARTMENT_DEADLINE_STATUSES, then=F("action_plan__target_date")),
        When(status__in=RESPONSE_STATUSES, then=F("report__response_deadline")),
        default=Value(None),
        output_field=DateField(),
    )


def annotate_workflow(queryset):
    """Adds `binding_deadline`, `status_entered_at` and the latest verification
    to every row. Idempotent, so callers never need to know whether a queryset
    was already annotated."""
    if "binding_deadline" in queryset.query.annotations:
        return queryset
    from apps.core.models import AuditTrail
    from apps.workflow.models import VerificationDecision

    latest = VerificationDecision.objects.filter(recommendation=OuterRef("pk")).order_by(
        "-created_at", "-id"
    )
    entered = (
        AuditTrail.objects.filter(recommendation=OuterRef("pk"))
        .annotate(_to_status=KT("metadata__to_status"))
        .filter(_to_status=OuterRef("status"))
        .order_by("-created_at", "-id")
    )
    queryset = queryset.annotate(
        latest_verification_decision=Subquery(latest.values("decision")[:1]),
        latest_verification_deadline=Subquery(latest.values("action_deadline")[:1]),
        status_entered_at=Coalesce(Subquery(entered.values("created_at")[:1]), F("created_at")),
    )
    return queryset.annotate(binding_deadline=_binding_deadline_expression())


def overdue_q(today=None) -> Q:
    """Department overdue, for an `annotate_workflow` queryset."""
    today = today or timezone.localdate()
    return Q(status__in=DEPARTMENT_DEADLINE_STATUSES, binding_deadline__lt=today)


def waiting_on_q(side: str) -> Q:
    if side == "audit":
        return Q(status__in=AUDIT_QUEUE_STATUSES + (S.DRAFT,)) | Q(
            status=S.PENDING_COUNCIL, report__status=AuditReport.Status.UNDER_REVIEW
        )
    if side == "council":
        return Q(status=S.PENDING_CLOSURE_COUNCIL) | (
            Q(status=S.PENDING_COUNCIL) & ~Q(report__status=AuditReport.Status.UNDER_REVIEW)
        )
    if side == "department":
        return Q(
            status__in=[status for status, role in NEXT_ROLE.items() if ROLE_SIDE.get(role) == "department"]
        )
    if side == "none":
        return Q(status=S.CLOSED)
    return Q(pk__in=[])


def my_turn_q(user) -> Q:
    """Cases waiting on this user's role (row scoping still applies on top)."""
    role = getattr(user, "role", None)
    if role == R.AUDIT:
        return waiting_on_q("audit")
    if role == R.COUNCIL:
        return waiting_on_q("council")
    statuses = [status for status, next_role in NEXT_ROLE.items() if next_role == role]
    q = Q(status__in=statuses)
    if role == R.EMPLOYEE:
        q &= Q(action_plan__responsible_employee=user)
    return q


# ---------------------------------------------------------------------------
# Python: the same facts for one loaded case
# ---------------------------------------------------------------------------
def _latest_verification(rec):
    if hasattr(rec, "latest_verification_decision"):
        return rec.latest_verification_decision, rec.latest_verification_deadline
    cache = getattr(rec, "_prefetched_objects_cache", {}) or {}
    if "verifications" in cache:
        items = sorted(cache["verifications"], key=lambda item: (item.created_at, item.id))
        latest = items[-1] if items else None
    else:
        latest = rec.verifications.order_by("-created_at", "-id").first()
    if latest is None:
        return None, None
    return latest.decision, latest.action_deadline


def _plan(rec):
    return guards._plan(rec)


def binding_deadline(rec):
    """(date, source) of the deadline the department is held to now, or
    (None, None). Sources: "plan", "verification" (W1) or "response"."""
    if hasattr(rec, "binding_deadline"):
        deadline = rec.binding_deadline
        if deadline is None:
            return None, None
        if rec.status in RESPONSE_STATUSES:
            return deadline, "response"
        decision = getattr(rec, "latest_verification_decision", None)
        if decision in RETURNED_WORK_DECISIONS and getattr(rec, "latest_verification_deadline", None):
            return deadline, "verification"
        return deadline, "plan"
    if rec.status in DEPARTMENT_DEADLINE_STATUSES:
        decision, action_deadline = _latest_verification(rec)
        if decision in RETURNED_WORK_DECISIONS and action_deadline:
            return action_deadline, "verification"
        plan = _plan(rec)
        if plan is not None and plan.target_date:
            return plan.target_date, "plan"
        return None, None
    if rec.status in RESPONSE_STATUSES and rec.report.response_deadline:
        return rec.report.response_deadline, "response"
    return None, None


def is_department_overdue(rec, today=None) -> bool:
    """Only the overdue flag (no queue-age lookup), for callers that need
    nothing else."""
    cached = getattr(rec, "_workflow_facts", None)
    if cached is not None:
        return cached["is_overdue"]
    if rec.status not in DEPARTMENT_DEADLINE_STATUSES:
        return False
    deadline, _source = binding_deadline(rec)
    return bool(deadline and deadline < (today or timezone.localdate()))


def waiting_on(rec) -> str:
    if rec.status == S.CLOSED:
        return "none"
    if rec.status == S.PENDING_COUNCIL and rec.report.status == AuditReport.Status.UNDER_REVIEW:
        return "audit"
    return ROLE_SIDE.get(NEXT_ROLE.get(rec.status), "none")


def next_role(rec):
    if rec.status == S.PENDING_COUNCIL and rec.report.status == AuditReport.Status.UNDER_REVIEW:
        return R.AUDIT
    return NEXT_ROLE.get(rec.status)


def waiting_since(rec):
    if hasattr(rec, "status_entered_at"):
        return rec.status_entered_at
    from apps.core.models import AuditTrail

    entry = (
        AuditTrail.objects.filter(recommendation=rec, metadata__to_status=rec.status)
        .order_by("-created_at", "-id")
        .values_list("created_at", flat=True)
        .first()
    )
    return entry or rec.created_at


def facts(rec, today=None) -> dict:
    """Everything the UI needs to say where a case stands. Cached per object."""
    cached = getattr(rec, "_workflow_facts", None)
    if cached is not None:
        return cached
    today = today or timezone.localdate()
    deadline, source = binding_deadline(rec)
    department_owned = rec.status in DEPARTMENT_DEADLINE_STATUSES
    overdue = bool(department_owned and deadline and deadline < today)
    response_overdue = bool(rec.status in RESPONSE_STATUSES and deadline and deadline < today)
    since = waiting_since(rec)
    since_date = timezone.localtime(since).date() if since else None
    plan = _plan(rec)
    data = {
        "stage": stage_of(rec.status),
        "stage_index": stage_index(rec.status),
        "returned": rec.status in RETURNED_STATUSES,
        "waiting_on": waiting_on(rec),
        "next_role": next_role(rec),
        "deadline": deadline,
        "deadline_source": source,
        "original_target_date": plan.target_date if plan is not None else None,
        "is_overdue": overdue,
        "days_overdue": (today - deadline).days if overdue else 0,
        "due_in_days": (deadline - today).days if deadline and not overdue and not response_overdue else None,
        "response_overdue": response_overdue,
        "waiting_since": since,
        "days_waiting": (today - since_date).days if since_date else 0,
    }
    rec._workflow_facts = data
    return data


def is_my_turn(rec, user) -> bool:
    role = getattr(user, "role", None)
    if role is None or rec.status == S.CLOSED:
        return False
    side = waiting_on(rec)
    if role == R.AUDIT:
        return side == "audit"
    if role == R.COUNCIL:
        return side == "council"
    if next_role(rec) != role:
        return False
    if role == R.DEPARTMENT_HEAD:
        return user.department_id == rec.report.department_id
    plan = _plan(rec)
    return bool(plan and plan.responsible_employee_id == user.id)


def _primary_action(actions):
    enabled = {item.id: item for item in actions if item.enabled}
    offered = {item.id: item for item in actions}
    if "mark_implemented" in offered and "mark_implemented" not in enabled:
        codes = {blocker.code for blocker in offered["mark_implemented"].blockers}
        if "evidence_required" in codes and "upload_evidence" in enabled and "required_steps_incomplete" not in codes:
            return "upload_evidence"
        if "update_progress" in enabled:
            return "update_progress"
    for action_id in PRIMARY_ACTION_ORDER:
        if action_id in enabled:
            return action_id
    return None


def _report_action(rec, user):
    role = getattr(user, "role", None)
    report = rec.report
    if role == R.AUDIT and rec.status == S.DRAFT and report.status == AuditReport.Status.DRAFT:
        return {"id": "submit_report_to_department", "report": report.id}
    if role == R.AUDIT and rec.status == S.PENDING_COUNCIL and report.status == AuditReport.Status.UNDER_REVIEW:
        return {"id": "submit_report_to_council", "report": report.id}
    if role == R.COUNCIL and rec.status == S.PENDING_COUNCIL and report.status == AuditReport.Status.PENDING_COUNCIL:
        return {"id": "ratify_report", "report": report.id}
    return None


def _next_actor(rec):
    role = next_role(rec)
    if role is None:
        return None
    person = None
    if role == R.EMPLOYEE:
        plan = _plan(rec)
        if plan is not None and plan.responsible_employee_id:
            employee = plan.responsible_employee
            person = {"id": employee.id, "name": employee.full_name_ar or employee.username}
    return {"role": role, "side": ROLE_SIDE.get(role), "user": person}


def workflow_block(rec, user) -> dict:
    """The `workflow` object of the case detail API."""
    data = facts(rec)
    actions = guards.available_actions(rec, user)
    return {
        "status": rec.status,
        "status_label": status_label(rec.status, rec.resolution, "ar"),
        "stage": data["stage"],
        "stage_index": data["stage_index"],
        "stage_count": len(STAGES),
        "returned": data["returned"],
        "waiting_on": data["waiting_on"],
        "next_actor": _next_actor(rec),
        "waiting_since": data["waiting_since"].isoformat() if data["waiting_since"] else None,
        "days_waiting": data["days_waiting"],
        "deadline": (
            {"date": data["deadline"].isoformat(), "source": data["deadline_source"]}
            if data["deadline"]
            else None
        ),
        "original_target_date": (
            data["original_target_date"].isoformat() if data["original_target_date"] else None
        ),
        "is_overdue": data["is_overdue"],
        "days_overdue": data["days_overdue"],
        "due_in_days": data["due_in_days"],
        "response_overdue": data["response_overdue"],
        "my_turn": is_my_turn(rec, user),
        "available_actions": [item.as_dict() for item in actions],
        "primary_action": _primary_action(actions),
        "report_action": _report_action(rec, user),
        "combined_closure_available": any(item.id == "verify" and item.enabled for item in actions),
    }


def contract() -> dict:
    """The presentation contract the frontend is generated against."""
    return {
        "stages": list(STAGES),
        "status_stage": dict(STATUS_STAGE),
        "status_labels": {status: dict(labels) for status, labels in STATUS_LABELS.items()},
        "closed_labels": {resolution: dict(labels) for resolution, labels in CLOSED_LABELS.items()},
        "next_role": {status: role for status, role in NEXT_ROLE.items()},
        "returned_statuses": list(RETURNED_STATUSES),
        "transient_statuses": list(TRANSIENT_STATUSES),
        "department_deadline_statuses": list(DEPARTMENT_DEADLINE_STATUSES),
        "audit_queue_statuses": list(AUDIT_QUEUE_STATUSES),
        "council_queue_statuses": list(COUNCIL_QUEUE_STATUSES),
        "actions": {
            action_id: {"statuses": list(rule.statuses), "roles": list(rule.roles)}
            for action_id, rule in guards.ACTIONS.items()
        },
    }
