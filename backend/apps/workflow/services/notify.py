"""Ad-hoc workflow notifications (reminder jobs use dedupe keys instead)."""

from apps.accounts.models import User
from apps.notifications.models import Notification

# Notification text is written in Arabic, but the model's choice labels are
# English ("Insufficient - returned"). Using get_decision_display() leaked that
# English string into Arabic users' notifications.
_VERIFICATION_LABELS_AR = {
    "sufficient": "كافية — إغلاق",
    "partial": "جزئية — تبقى مفتوحة",
    "insufficient": "غير كافية — أُعيدت للاستكمال",
}


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
