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

    audit/council: municipality-wide; department_head: own department;
    employee: own assigned recommendations only.
    """
    queryset = queryset.filter(report__municipality=user.municipality)
    if user.role == User.Role.DEPARTMENT_HEAD:
        return queryset.filter(report__department=user.department)
    if user.role == User.Role.EMPLOYEE:
        return queryset.filter(action_plan__responsible_employee=user)
    if user.role in (User.Role.AUDIT, User.Role.COUNCIL):
        return queryset
    return queryset.none()


def scope_reports(queryset, user):
    queryset = queryset.filter(municipality=user.municipality)
    if user.role == User.Role.DEPARTMENT_HEAD:
        return queryset.filter(department=user.department)
    if user.role == User.Role.EMPLOYEE:
        return queryset.filter(recommendations__action_plan__responsible_employee=user).distinct()
    if user.role in (User.Role.AUDIT, User.Role.COUNCIL):
        return queryset
    return queryset.none()
