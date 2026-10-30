"""Ad-hoc workflow notifications (reminder jobs use dedupe keys instead)."""

from apps.accounts.models import User
from apps.core.arabic import recommendations
from apps.notifications.models import Notification
from apps.core.refs import record_code

# Notification text is written in Arabic, but the model's choice labels are
# English ("Insufficient - returned"). Using get_decision_display() leaked that
# English string into Arabic users' notifications.
_VERIFICATION_LABELS_AR = {
    "sufficient": "كافية — إغلاق",
    "partial": "جزئية — تبقى مفتوحة",
    "insufficient": "غير كافية — أُعيدت للاستكمال",
}


class LocalizedMessage(str):
    """Arabic text plus the key and parameters to render it in any language."""

    def __new__(cls, key, text, **params):
        obj = super().__new__(cls, text)
        obj.key = key
        obj.params = params
        return obj


def msg(key, text, **params):
    return LocalizedMessage(key, text, **params)


def _notify(users, recommendation, ntype, message, report=None):
    seen = set()
    rows = []
    for user in users or []:
        if user is None or not getattr(user, "pk", None) or not user.is_active:
            continue
        if user.pk in seen:
            continue
        seen.add(user.pk)
        rows.append(
            Notification(
                user=user, recommendation=recommendation, report=report, type=ntype, message=message,
                message_key=getattr(message, "key", ""), message_params=getattr(message, "params", {}),
            )
        )
    if rows:
        Notification.objects.bulk_create(rows)


def _notify_report(users, report, recommendations, ntype, message):
    """One notification per person for a report-level event, instead of one
    per recommendation. A single-recommendation report still links to it."""
    recommendations = list(recommendations)
    if not recommendations:
        return
    only = recommendations[0] if len(recommendations) == 1 else None
    _notify(users, only, ntype, message, report=report)


def _count_phrase(count):
    return recommendations(count)


def _rec_ref(recommendation):
    return record_code(recommendation.id)


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
