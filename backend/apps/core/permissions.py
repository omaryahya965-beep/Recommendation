from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class RolePermission(BasePermission):
    """Base class: allows only the configured roles."""

    allowed_roles: tuple = ()

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsAudit(RolePermission):
    allowed_roles = (User.Role.AUDIT,)


class IsDepartmentHead(RolePermission):
    allowed_roles = (User.Role.DEPARTMENT_HEAD,)


class IsEmployee(RolePermission):
    allowed_roles = (User.Role.EMPLOYEE,)


class IsCouncil(RolePermission):
    allowed_roles = (User.Role.COUNCIL,)


class IsAuditOrCouncil(RolePermission):
    allowed_roles = (User.Role.AUDIT, User.Role.COUNCIL)


class IsAuditOrDepartmentHead(RolePermission):
    allowed_roles = (User.Role.AUDIT, User.Role.DEPARTMENT_HEAD)


def scope_recommendations(queryset, user):
    """Row-level scoping applied to every recommendation queryset.

    audit: municipality-wide, including unissued drafts (audit authors them).
    council: municipality-wide, issued work only.
    department_head: own department, issued work only.
    employee: own assigned recommendations only, issued work only.

    "Issued" means the audit unit has released the report to the department.
    A draft recommendation, or any recommendation still sitting in a draft
    report, is internal audit working material and must never leak to the
    audited department, the assigned employee, or the council.
    """
    if getattr(user, "municipality_id", None) is None:
        return queryset.none()

    queryset = queryset.filter(report__municipality_id=user.municipality_id)

    if user.role == User.Role.AUDIT:
        return queryset

    # Everyone else sees issued work only.
    queryset = queryset.exclude(status=_RecommendationStatus().DRAFT).exclude(
        report__status=_ReportStatus().DRAFT
    )

    if user.role == User.Role.DEPARTMENT_HEAD:
        return queryset.filter(report__department_id=user.department_id)
    if user.role == User.Role.EMPLOYEE:
        return queryset.filter(action_plan__responsible_employee=user)
    if user.role == User.Role.COUNCIL:
        return queryset
    return queryset.none()


def recommendation_scope_key(user):
    """A cache-key fragment that is identical for two users exactly when
    `scope_recommendations` gives them the same rows.

    It must name every user attribute that function reads. If scoping ever
    starts depending on something else, add it here, or cached aggregates
    will be served across scopes.
    """
    role = getattr(user, "role", "") or "-"
    key = f"m{getattr(user, 'municipality_id', None)}:{role}"
    if role == User.Role.DEPARTMENT_HEAD:
        key += f":d{user.department_id}"
    elif role == User.Role.EMPLOYEE:
        key += f":u{user.pk}"
    return key


def scope_reports(queryset, user):
    """Row-level scoping for reports. Mirrors `scope_recommendations`."""
    if getattr(user, "municipality_id", None) is None:
        return queryset.none()

    queryset = queryset.filter(municipality_id=user.municipality_id)

    if user.role == User.Role.AUDIT:
        return queryset

    queryset = queryset.exclude(status=_ReportStatus().DRAFT)

    if user.role == User.Role.DEPARTMENT_HEAD:
        return queryset.filter(department_id=user.department_id)
    if user.role == User.Role.EMPLOYEE:
        return queryset.filter(
            recommendations__action_plan__responsible_employee=user
        ).distinct()
    if user.role == User.Role.COUNCIL:
        return queryset
    return queryset.none()


def _RecommendationStatus():
    # Imported lazily: apps.audits imports this module at load time.
    from apps.audits.models import Recommendation

    return Recommendation.Status


def _ReportStatus():
    from apps.audits.models import AuditReport

    return AuditReport.Status
