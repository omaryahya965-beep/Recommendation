"""Workflow operations.

Each function is the single entry point for one business action. All guards
live here (never in the frontend): transition validation, mandatory
justifications, closure rules, structured rejection feedback.
"""
import logging

from django.db import transaction as db_transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audits.models import AuditReport, Recommendation
from apps.core.exceptions import StorageUnavailable, WorkflowError
from apps.core.files import bind_stored_name
from apps.core.models import log_action
from apps.core.uploads import claim_uploaded_file
from apps.notifications.models import Notification

from .models import (
    ActionPlan,
    ActionStep,
    ApprovalRecord,
    Evidence,
    ManagementResponse,
    VerificationDecision,
)
from .transitions import transition

S = Recommendation.Status
logger = logging.getLogger(__name__)

# Notification text is written in Arabic, but the model's choice labels are
# English ("Insufficient - returned"). Using get_decision_display() leaked that
# English string into Arabic users' notifications.
_VERIFICATION_LABELS_AR = {
    "sufficient": "كافية — إغلاق",
    "partial": "جزئية — تبقى مفتوحة",
    "insufficient": "غير كافية — أُعيدت للاستكمال",
}


# ---------------------------------------------------------------------------
# Notification helpers (ad-hoc events; reminder jobs use dedupe keys instead)
# ---------------------------------------------------------------------------
def _notify(users, recommendation, ntype, message):
    seen = set()
    rows = []
    for user in users or []:
        if user is None or not getattr(user, "pk", None) or not user.is_active:
            continue
        if user.pk in seen:
            continue
        seen.add(user.pk)
        rows.append(
            Notification(user=user, recommendation=recommendation, type=ntype, message=message)
        )
    if rows:
        Notification.objects.bulk_create(rows)


def _rec_ref(recommendation):
    return f"REC-{recommendation.id}"


def _heads_of(recommendation):
    return _department_heads(recommendation.report.department)


def _assignee(recommendation):
    plan = getattr(recommendation, "action_plan", None)
    return plan.responsible_employee if plan else None


def _department_heads(department):
    return User.objects.filter(
        role=User.Role.DEPARTMENT_HEAD, department=department, is_active=True
    )


def _audit_users(municipality):
    return User.objects.filter(
        role=User.Role.AUDIT, municipality=municipality, is_active=True
    )


def _council_users(municipality):
    return User.objects.filter(
        role=User.Role.COUNCIL, municipality=municipality, is_active=True
    )


def _policy(report):
    policy = getattr(report.municipality, "workflow_policy", None)
    return policy


# ---------------------------------------------------------------------------
# Report level
# ---------------------------------------------------------------------------
@db_transaction.atomic
def submit_report_to_department(report, user):
    report.refresh_from_db()
    if report.status != AuditReport.Status.DRAFT:
        raise WorkflowError("Only draft reports can be sent to the department.")
    recommendations = list(report.recommendations.all())
    if not recommendations:
        raise WorkflowError("The report has no recommendations to send.")

    for rec in recommendations:
        if rec.status == S.DRAFT:
            transition(rec, S.PENDING_RESPONSE, user, "report_submitted_to_department")
            _notify(
                _department_heads(report.department),
                rec,
                Notification.Type.RESPONSE_NEEDED,
                f"توصية جديدة بانتظار رد الإدارة — {_rec_ref(rec)} في التقرير: {report.title}",
            )

    report.status = AuditReport.Status.PENDING_RESPONSE
    report.save(update_fields=["status", "updated_at"])
    log_action(user, "report_submitted_to_department", report=report)
    return report


@db_transaction.atomic
def submit_report_to_council(report, user):
    report.refresh_from_db()
    if report.status != AuditReport.Status.UNDER_REVIEW:
        raise WorkflowError("The report must be under audit review before council submission.")
    pending = report.recommendations.exclude(status=S.PENDING_COUNCIL).count()
    if pending:
        raise WorkflowError(
            f"{pending} recommendation(s) are not yet audit-approved for council submission."
        )
    report.status = AuditReport.Status.PENDING_COUNCIL
    report.save(update_fields=["status", "updated_at"])
    log_action(user, "report_submitted_to_council", report=report)
    for rec in report.recommendations.all():
        _notify(
            _council_users(report.municipality),
            rec,
            Notification.Type.ACTION_REQUIRED,
            f"توصية بانتظار مصادقة المجلس — {_rec_ref(rec)} في التقرير: {report.title}",
        )
    return report


@db_transaction.atomic
def ratify_report(report, user, notes=""):
    """COUNCIL_RATIFICATION: the only event that sets the reminder anchor date."""
    report.refresh_from_db()
    if report.status != AuditReport.Status.PENDING_COUNCIL:
        raise WorkflowError("Only reports pending council ratification can be ratified.")

    now = timezone.now()
    policy = _policy(report)
    require_plan_with_response = bool(policy and policy.require_plan_with_response)

    for rec in report.recommendations.select_related("response").all():
        ApprovalRecord.objects.create(
            recommendation=rec,
            approval_type=ApprovalRecord.ApprovalType.COUNCIL_RATIFICATION,
            approved_by=user,
            notes=notes,
        )
        response = getattr(rec, "response", None)
        if response and response.decision == ManagementResponse.Decision.DISAGREE:
            rec.resolution = Recommendation.Resolution.DISAGREEMENT_ACCEPTED
            rec.save(update_fields=["resolution", "updated_at"])
            transition(rec, S.CLOSED, user, "council_ratified_disagreement")
            _notify(
                list(_department_heads(report.department)) + list(_audit_users(report.municipality)),
                rec,
                Notification.Type.STATUS_CHANGE,
                f"أغلق المجلس التوصية {_rec_ref(rec)} بعد قبول عدم الاتفاق.",
            )
            continue

        transition(rec, S.APPROVED_FOR_IMPLEMENTATION, user, "council_ratification")
        plan = getattr(rec, "action_plan", None)
        if require_plan_with_response and plan and plan.status == ActionPlan.Status.APPROVED:
            transition(rec, S.ACTION_PLAN_APPROVED, user, "plan_pre_approved_with_response", system=True)
            transition(rec, S.IN_PROGRESS, user, "execution_started", system=True)
            _notify(
                [plan.responsible_employee],
                rec,
                Notification.Type.ACTION_REQUIRED,
                f"بدأ تنفيذ التوصية المسندة إليك — {_rec_ref(rec)}.",
            )
            _notify(
                _department_heads(report.department),
                rec,
                Notification.Type.STATUS_CHANGE,
                f"صادق المجلس على {_rec_ref(rec)} وبدأ التنفيذ.",
            )
        else:
            transition(rec, S.ACTION_PLAN_REQUIRED, user, "action_plan_requested", system=True)
            _notify(
                _department_heads(report.department),
                rec,
                Notification.Type.ACTION_REQUIRED,
                f"صادق المجلس على {_rec_ref(rec)} — المطلوب تقديم خطة العمل.",
            )

    report.status = AuditReport.Status.RATIFIED
    report.council_approval_date = now
    report.save(update_fields=["status", "council_approval_date", "updated_at"])
    log_action(user, "report_ratified_by_council", report=report, notes=notes)
    return report


# ---------------------------------------------------------------------------
# Management response (+ optional plan when policy requires it)
# ---------------------------------------------------------------------------
@db_transaction.atomic
def submit_response(recommendation, user, decision, justification="", attachment=None,
                    plan_data=None, stored_name=""):
    if recommendation.status not in (S.PENDING_RESPONSE, S.RETURNED_FOR_REVISION):
        raise WorkflowError("This recommendation is not awaiting a department response.")
    if user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only respond to your own department's recommendations.")
    if decision == ManagementResponse.Decision.DISAGREE and not justification.strip():
        raise WorkflowError("Disagreement requires a written justification.")

    policy = _policy(recommendation.report)
    require_plan = bool(policy and policy.require_plan_with_response)
    if require_plan and decision == ManagementResponse.Decision.AGREE and not plan_data:
        raise WorkflowError(
            "Municipal policy requires the action plan to be submitted with the response."
        )

    response = getattr(recommendation, "response", None)
    if response is None:
        response = ManagementResponse(recommendation=recommendation, submitted_by=user)
    else:
        response.revision_count += 1
        response.submitted_by = user
    previous = {
        "decision": response.decision,
        "justification": response.justification,
        "review_status": response.review_status,
    } if response.pk else None
    response.decision = decision
    response.justification = justification
    try:
        if stored_name:
            # Never trust a client-supplied storage key: confirm with the
            # storage provider that this user uploaded it, into the right
            # folder, within the size and type limits.
            stored_name = claim_uploaded_file(
                stored_name, purpose="response", user=user
            )
            bind_stored_name(response, "attachment", stored_name)
        elif attachment is not None:
            response.attachment = attachment
        response.review_status = ManagementResponse.ReviewStatus.PENDING
        response.save()
    except OSError as exc:
        raise StorageUnavailable(
            "Could not store the uploaded file. File storage is unavailable."
        ) from exc

    if plan_data and decision == ManagementResponse.Decision.AGREE:
        _upsert_plan(recommendation, user, plan_data)

    transition(
        recommendation, S.AUDIT_REVIEW, user, "management_response_submitted",
        decision=decision, previous_response=previous,
    )
    if recommendation.report.status == AuditReport.Status.PENDING_RESPONSE:
        recommendation.report.status = AuditReport.Status.UNDER_REVIEW
        recommendation.report.save(update_fields=["status", "updated_at"])

    _notify(
        _audit_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"رد إدارة جديد بانتظار مراجعة التدقيق الداخلي — {_rec_ref(recommendation)}.",
    )
    return response


@db_transaction.atomic
def review_response(recommendation, user, accept, notes=""):
    """Audit reviews the response (and plan, when submitted together) as one unit."""
    if recommendation.status != S.AUDIT_REVIEW:
        raise WorkflowError("This recommendation's response is not under audit review.")
    response = getattr(recommendation, "response", None)
    if response is None:
        raise WorkflowError("No management response exists to review.")

    response.reviewed_by = user
    response.audit_review_notes = notes

    if accept:
        response.review_status = ManagementResponse.ReviewStatus.ACCEPTED
        response.save()
        plan = getattr(recommendation, "action_plan", None)
        policy = _policy(recommendation.report)
        if (
            policy and policy.require_plan_with_response
            and response.decision == ManagementResponse.Decision.AGREE
            and plan is not None
        ):
            plan.status = ActionPlan.Status.APPROVED
            plan.reviewed_by = user
            plan.review_notes = notes
            plan.save()
        ApprovalRecord.objects.create(
            recommendation=recommendation,
            approval_type=ApprovalRecord.ApprovalType.AUDIT_APPROVAL,
            approved_by=user,
            notes=notes,
        )
        transition(recommendation, S.PENDING_COUNCIL, user, "audit_approved_response", notes=notes)
        _notify(
            _heads_of(recommendation),
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"قبل التدقيق رد الإدارة على {_rec_ref(recommendation)}. بانتظار رفع التقرير للمجلس.",
        )
    else:
        if not notes.strip():
            raise WorkflowError("Rejecting a response requires review notes for the department.")
        response.review_status = ManagementResponse.ReviewStatus.REJECTED
        response.save()
        transition(
            recommendation, S.RETURNED_FOR_REVISION, user, "audit_rejected_response", notes=notes
        )
        _notify(
            _department_heads(recommendation.report.department),
            recommendation,
            Notification.Type.RETURNED,
            f"أُعيد رد الإدارة للتعديل على {_rec_ref(recommendation)}: {notes}",
        )
    return response


# ---------------------------------------------------------------------------
# Action plan (default: after ratification)
# ---------------------------------------------------------------------------
def _upsert_plan(recommendation, user, plan_data):
    """Create or update the plan and its steps; history goes to AuditTrail."""
    employee = plan_data["responsible_employee"]
    if employee.department_id != recommendation.report.department_id:
        raise WorkflowError("The responsible employee must belong to the audited department.")
    if employee.role != User.Role.EMPLOYEE:
        raise WorkflowError("The responsible person must have the employee role.")

    plan = getattr(recommendation, "action_plan", None)
    previous = None
    if plan is None:
        plan = ActionPlan(recommendation=recommendation, submitted_by=user)
    else:
        previous = {
            "responsible_employee": plan.responsible_employee_id,
            "target_date": str(plan.target_date),
            "notes": plan.notes,
            "steps": list(plan.steps.values("title", "order", "is_done")),
        }
        plan.revision_count += 1
        plan.submitted_by = user
    plan.responsible_employee = employee
    plan.target_date = plan_data["target_date"]
    plan.notes = plan_data.get("notes", "")
    plan.status = ActionPlan.Status.SUBMITTED
    plan.save()

    steps = plan_data.get("steps")
    if steps is not None:
        plan.steps.all().delete()
        created = {}
        for idx, step in enumerate(steps):
            obj = ActionStep.objects.create(
                plan=plan,
                title=step["title"],
                order=step.get("order", idx),
                comments=step.get("comments", ""),
            )
            created[idx] = obj
        for idx, step in enumerate(steps):
            dep = step.get("depends_on_index")
            if dep is not None and dep in created and dep != idx:
                created[idx].depends_on = created[dep]
                created[idx].save(update_fields=["depends_on"])

    log_action(
        user, "action_plan_submitted", recommendation=recommendation,
        report=recommendation.report, previous_plan=previous,
        target_date=str(plan.target_date), responsible_employee=employee.username,
    )
    return plan


@db_transaction.atomic
def submit_action_plan(recommendation, user, plan_data):
    if recommendation.status not in (S.ACTION_PLAN_REQUIRED, S.REVISION_REQUIRED):
        raise WorkflowError("This recommendation is not awaiting an action plan.")
    if user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only submit plans for your own department.")

    plan = _upsert_plan(recommendation, user, plan_data)
    transition(recommendation, S.ACTION_PLAN_REVIEW, user, "action_plan_submitted_for_review")
    _notify(
        _audit_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"خطة عمل جديدة بانتظار مراجعة التدقيق الداخلي — {_rec_ref(recommendation)}.",
    )
    return plan


@db_transaction.atomic
def review_action_plan(recommendation, user, approve, notes=""):
    if recommendation.status != S.ACTION_PLAN_REVIEW:
        raise WorkflowError("This recommendation's action plan is not under review.")
    plan = getattr(recommendation, "action_plan", None)
    if plan is None:
        raise WorkflowError("No action plan exists to review.")

    plan.reviewed_by = user
    plan.review_notes = notes

    if approve:
        plan.status = ActionPlan.Status.APPROVED
        plan.save()
        transition(recommendation, S.ACTION_PLAN_APPROVED, user, "action_plan_approved", notes=notes)
        transition(recommendation, S.IN_PROGRESS, user, "execution_started", system=True)
        _notify(
            [plan.responsible_employee],
            recommendation,
            Notification.Type.ACTION_REQUIRED,
            f"اعتُمدت خطة العمل وبدأ التنفيذ للتوصية المسندة إليك — {_rec_ref(recommendation)}.",
        )
        _notify(
            _heads_of(recommendation),
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"اعتُمدت خطة العمل لـ {_rec_ref(recommendation)} وبدأ التنفيذ.",
        )
    else:
        if not notes.strip():
            raise WorkflowError("Requesting a plan revision requires review notes.")
        plan.status = ActionPlan.Status.REVISION_REQUIRED
        plan.save()
        transition(recommendation, S.REVISION_REQUIRED, user, "action_plan_revision_requested", notes=notes)
        recipients = list(_heads_of(recommendation))
        if plan.responsible_employee_id:
            recipients.append(plan.responsible_employee)
        _notify(
            recipients,
            recommendation,
            Notification.Type.RETURNED,
            f"مطلوب تعديل خطة العمل لـ {_rec_ref(recommendation)}: {notes}",
        )
    return plan


# ---------------------------------------------------------------------------
# Execution: steps, evidence, self-assessment
# ---------------------------------------------------------------------------
EXECUTION_STATUSES = (S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED)


def _ensure_executor(recommendation, user):
    plan = getattr(recommendation, "action_plan", None)
    if plan is None:
        raise WorkflowError("No approved action plan exists for this recommendation.")
    if user.role == User.Role.EMPLOYEE and plan.responsible_employee_id != user.id:
        raise WorkflowError("Only the responsible employee may update this recommendation.")
    if user.role == User.Role.DEPARTMENT_HEAD and user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only act within your own department.")
    if user.role not in (User.Role.EMPLOYEE, User.Role.DEPARTMENT_HEAD):
        raise WorkflowError("Only the responsible employee or department head may do this.")
    return plan


def _resume_if_returned(recommendation, user):
    """Working on a returned/partial/reopened item moves it back to in_progress."""
    if recommendation.status in (S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED):
        transition(recommendation, S.IN_PROGRESS, user, "execution_resumed", system=True)


@db_transaction.atomic
def update_step_progress(recommendation, step, user, progress_percent=None, is_done=None,
                         comments=None):
    if recommendation.status not in EXECUTION_STATUSES:
        raise WorkflowError("Step progress can only be updated during execution.")
    plan = _ensure_executor(recommendation, user)
    if step.plan_id != plan.id:
        raise WorkflowError("This step does not belong to the recommendation's plan.")
    if step.depends_on_id and is_done:
        dep = ActionStep.objects.get(pk=step.depends_on_id)
        if not dep.is_done:
            raise WorkflowError(
                f"Step '{step.title}' depends on '{dep.title}', which is not completed yet."
            )

    previous = {
        "progress_percent": step.progress_percent,
        "is_done": step.is_done,
        "comments": step.comments,
    }
    if progress_percent is not None:
        if not 0 <= progress_percent <= 100:
            raise WorkflowError("Progress must be between 0 and 100.")
        step.progress_percent = progress_percent
    if is_done is not None:
        step.is_done = is_done
        if is_done:
            step.progress_percent = 100
    if comments is not None:
        step.comments = comments
    step.save()

    _resume_if_returned(recommendation, user)
    log_action(
        user, "step_progress_updated", recommendation=recommendation,
        report=recommendation.report, step_id=step.id, step_title=step.title,
        previous=previous,
        current={"progress_percent": step.progress_percent, "is_done": step.is_done},
    )
    return step


@db_transaction.atomic
def add_evidence(recommendation, user, file=None, step=None, notes="", stored_name=""):
    if recommendation.status not in EXECUTION_STATUSES + (S.PENDING_HEAD_REVIEW, S.SUBMITTED_FOR_VERIFICATION):
        raise WorkflowError("Evidence can only be uploaded during execution or verification.")
    _ensure_executor(recommendation, user)
    if step is not None and step.plan.recommendation_id != recommendation.id:
        raise WorkflowError("The linked step does not belong to this recommendation.")
    if file is None and not stored_name:
        raise WorkflowError("A file is required.")

    if stored_name:
        # Same rule as management-response attachments: the key is verified
        # against the storage provider before it is attached to a case.
        stored_name = claim_uploaded_file(stored_name, purpose="evidence", user=user)

    try:
        evidence = Evidence(
            recommendation=recommendation, step=step, uploaded_by=user, notes=notes
        )
        if stored_name:
            bind_stored_name(evidence, "file", stored_name)
        else:
            evidence.file = file
        evidence.save()
    except OSError as exc:
        raise StorageUnavailable(
            "Could not store the uploaded file. File storage is unavailable."
        ) from exc
    _resume_if_returned(recommendation, user)
    log_action(
        user, "evidence_uploaded", recommendation=recommendation,
        report=recommendation.report, evidence_id=evidence.id,
        file_name=evidence.file.name, step_id=step.id if step else None,
    )
    return evidence


@db_transaction.atomic
def delete_evidence(recommendation, user, evidence):
    """Remove an uploaded evidence file during implementation.

    Same actors as upload: the responsible employee (own files only) or the
    department head. Not allowed after the case leaves implementation/verification.
    """
    if evidence.recommendation_id != recommendation.id:
        raise WorkflowError("This evidence does not belong to this recommendation.")
    if recommendation.status not in EXECUTION_STATUSES + (
        S.PENDING_HEAD_REVIEW,
        S.SUBMITTED_FOR_VERIFICATION,
    ):
        raise WorkflowError("Evidence can only be removed during implementation.")
    _ensure_executor(recommendation, user)
    if user.role == User.Role.EMPLOYEE and evidence.uploaded_by_id != user.id:
        raise WorkflowError("You can only remove evidence files that you uploaded.")

    file_name = evidence.file.name if evidence.file else ""
    evidence_id = evidence.id
    step_id = evidence.step_id
    if file_name:
        try:
            evidence.file.delete(save=False)
        except Exception:
            logger.warning(
                "evidence_storage_delete_failed name=%s", file_name, exc_info=True
            )
    evidence.delete()
    log_action(
        user, "evidence_deleted", recommendation=recommendation,
        report=recommendation.report, evidence_id=evidence_id,
        file_name=file_name, step_id=step_id,
    )


@db_transaction.atomic
def mark_implemented(recommendation, user):
    """Employee self-assessment. NEVER closes the recommendation and NEVER
    skips the department head: it only submits implementation for the head
    to review, and only when required steps are done and evidence exists."""
    if recommendation.status not in (
        S.IN_PROGRESS, S.RETURNED_INSUFFICIENT, S.PARTIAL, S.REOPENED
    ):
        raise WorkflowError("Only recommendations under execution can be marked implemented.")
    _ensure_executor(recommendation, user)

    plan = recommendation.action_plan
    incomplete = plan.steps.filter(is_required_for_closure=True, is_done=False)
    if incomplete.exists():
        titles = ", ".join(incomplete.values_list("title", flat=True)[:5])
        raise WorkflowError(f"Required steps are not completed yet: {titles}")
    if not recommendation.evidence_files.exists():
        raise WorkflowError("At least one evidence file is required before submission.")

    transition(
        recommendation, S.PENDING_HEAD_REVIEW, user, "marked_implemented"
    )
    _notify(
        _department_heads(recommendation.report.department),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"تنفيذ {_rec_ref(recommendation)} بانتظار مراجعة رئيس الدائرة قبل إرساله للرقابة الداخلية.",
    )
    return recommendation


@db_transaction.atomic
def review_implementation(recommendation, user, accept, notes=""):
    """Department head reviews execution and evidence, then either returns it
    to the employee or submits it to internal audit."""
    if recommendation.status != S.PENDING_HEAD_REVIEW:
        raise WorkflowError("This recommendation is not awaiting department review of implementation.")
    if user.role != User.Role.DEPARTMENT_HEAD:
        raise WorkflowError("Only the department head may review implementation.")
    if user.department_id != recommendation.report.department_id:
        raise WorkflowError("You can only review implementation in your own department.")

    if accept:
        ApprovalRecord.objects.create(
            recommendation=recommendation,
            approval_type=ApprovalRecord.ApprovalType.HEAD_IMPLEMENTATION_REVIEW,
            approved_by=user,
            notes=notes,
        )
        transition(
            recommendation, S.SUBMITTED_FOR_VERIFICATION, user,
            "implementation_submitted_to_audit", notes=notes,
        )
        _notify(
            _audit_users(recommendation.report.municipality),
            recommendation,
            Notification.Type.ACTION_REQUIRED,
            f"توصية بانتظار تحقق التدقيق الداخلي من الأدلة — {_rec_ref(recommendation)}.",
        )
        assignee = _assignee(recommendation)
        if assignee:
            _notify(
                [assignee],
                recommendation,
                Notification.Type.STATUS_CHANGE,
                f"رُفع تنفيذ {_rec_ref(recommendation)} إلى التدقيق الداخلي للتحقق.",
            )
    else:
        if not notes.strip():
            raise WorkflowError("Returning implementation to the employee requires notes.")
        transition(
            recommendation, S.IN_PROGRESS, user,
            "implementation_returned_by_head", notes=notes,
        )
        _notify(
            [_assignee(recommendation)],
            recommendation,
            Notification.Type.RETURNED,
            f"أعادت الإدارة التنفيذ للمزيد من العمل على {_rec_ref(recommendation)}: {notes}",
        )
    return recommendation


# ---------------------------------------------------------------------------
# Verification (does NOT close — sufficient evidence starts closure review)
# ---------------------------------------------------------------------------
@db_transaction.atomic
def verify(recommendation, user, decision, notes="", rejected_items="", rejection_reason="",
           required_action="", action_deadline=None):
    if recommendation.status != S.SUBMITTED_FOR_VERIFICATION:
        raise WorkflowError("Only recommendations submitted for verification can be verified.")

    D = VerificationDecision.Decision
    if decision != D.SUFFICIENT:
        missing = []
        if not rejected_items.strip():
            missing.append("what was rejected (rejected_items)")
        if not rejection_reason.strip():
            missing.append("why (rejection_reason)")
        if not required_action.strip():
            missing.append("what is required next (required_action)")
        if action_deadline is None:
            missing.append("deadline (action_deadline)")
        if missing:
            raise WorkflowError(
                "A non-sufficient verification must specify: " + "; ".join(missing) + "."
            )

    plan = getattr(recommendation, "action_plan", None)
    assigned_to = plan.responsible_employee if plan else None

    verification = VerificationDecision.objects.create(
        recommendation=recommendation,
        decision=decision,
        reviewed_by=user,
        notes=notes,
        rejected_items=rejected_items,
        rejection_reason=rejection_reason,
        required_action=required_action,
        action_deadline=action_deadline,
        assigned_to=assigned_to if decision != D.SUFFICIENT else None,
    )

    if decision == D.SUFFICIENT:
        transition(recommendation, S.CLOSURE_REVIEW, user, "verified_sufficient", notes=notes)
        _notify(
            list(_heads_of(recommendation)) + [_assignee(recommendation)],
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"قبل التدقيق أدلة {_rec_ref(recommendation)}. التوصية في مراجعة الإغلاق.",
        )
    elif decision == D.PARTIAL:
        transition(recommendation, S.PARTIAL, user, "verified_partial", notes=notes)
    else:
        transition(recommendation, S.RETURNED_INSUFFICIENT, user, "verified_insufficient", notes=notes)

    if decision != D.SUFFICIENT:
        _notify(
            list(_heads_of(recommendation)) + [assigned_to],
            recommendation,
            Notification.Type.RETURNED,
            (
                f"قرار التحقق على {_rec_ref(recommendation)}: {_VERIFICATION_LABELS_AR.get(decision, decision)}. "
                f"المرفوض: {rejected_items}. السبب: {rejection_reason}. "
                f"المطلوب: {required_action}. الموعد النهائي: {action_deadline}."
            ),
        )
    return verification


@db_transaction.atomic
def submit_for_closure(recommendation, user, notes=""):
    """Audit completes the Recommendation Closure Review and sends it to council."""
    if recommendation.status != S.CLOSURE_REVIEW:
        raise WorkflowError("Only recommendations in closure review can be sent to council.")
    ApprovalRecord.objects.create(
        recommendation=recommendation,
        approval_type=ApprovalRecord.ApprovalType.CLOSURE_REVIEW,
        approved_by=user,
        notes=notes,
    )
    transition(
        recommendation, S.PENDING_CLOSURE_COUNCIL, user,
        "closure_submitted_to_council", notes=notes,
    )
    _notify(
        _council_users(recommendation.report.municipality),
        recommendation,
        Notification.Type.ACTION_REQUIRED,
        f"توصية بانتظار مراجعة المجلس لإغلاقها — {_rec_ref(recommendation)}.",
    )
    _notify(
        list(_heads_of(recommendation)) + [_assignee(recommendation)],
        recommendation,
        Notification.Type.STATUS_CHANGE,
        f"أُرسلت {_rec_ref(recommendation)} إلى المجلس لمراجعة الإغلاق.",
    )
    return recommendation


@db_transaction.atomic
def council_closure(recommendation, user, accept, notes=""):
    """Council reviews the follow-up / closure package.

    Agree -> CLOSED. Disagree -> REOPENED for further action.
    """
    if recommendation.status != S.PENDING_CLOSURE_COUNCIL:
        raise WorkflowError("This recommendation is not awaiting council closure review.")
    if not accept and not notes.strip():
        raise WorkflowError("Reopening a recommendation requires written notes for further action.")

    ApprovalRecord.objects.create(
        recommendation=recommendation,
        approval_type=ApprovalRecord.ApprovalType.CLOSURE_COUNCIL,
        approved_by=user,
        notes=notes,
    )
    if accept:
        recommendation.resolution = Recommendation.Resolution.IMPLEMENTED
        recommendation.save(update_fields=["resolution", "updated_at"])
        transition(recommendation, S.CLOSED, user, "council_closed_recommendation", notes=notes)
        _notify(
            list(_audit_users(recommendation.report.municipality))
            + list(_heads_of(recommendation))
            + [_assignee(recommendation)],
            recommendation,
            Notification.Type.STATUS_CHANGE,
            f"أغلق المجلس التوصية {_rec_ref(recommendation)}.",
        )
    else:
        transition(recommendation, S.REOPENED, user, "council_reopened_recommendation", notes=notes)
        _notify(
            list(_heads_of(recommendation))
            + [_assignee(recommendation)]
            + list(_audit_users(recommendation.report.municipality)),
            recommendation,
            Notification.Type.RETURNED,
            f"المجلس طلب إجراءً إضافياً ولم يُغلق {_rec_ref(recommendation)}: {notes}",
        )
    return recommendation


# ---------------------------------------------------------------------------
# Recurrence confirmation (human-in-the-loop)
# ---------------------------------------------------------------------------
@db_transaction.atomic
def confirm_recurrence(recommendation, user, confirmed):
    if not recommendation.is_recurring:
        raise WorkflowError("This recommendation is not flagged as possibly recurring.")
    recommendation.recurrence_confirmed = confirmed
    if not confirmed:
        recommendation.is_recurring = False
        recommendation.similar_recommendation = None
        recommendation.similarity_score = None
    recommendation.save()
    log_action(
        user, "recurrence_reviewed", recommendation=recommendation,
        report=recommendation.report, confirmed=confirmed,
    )
    return recommendation
