"""Development-only seed: creates a demo municipality, departments and one or
more users per role so every workflow can be exercised locally.

This never runs automatically and puts no data into production paths.
"""
from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.notifications.services import ensure_default_rules
from apps.organizations.models import Department, Municipality, WorkflowPolicy

PASSWORD = "Demo@12345"

USERS = [
    # username, role, department name (or None), Arabic full name
    ("audit1", User.Role.AUDIT, None, "وحدة التدقيق الداخلي"),
    ("head_finance", User.Role.DEPARTMENT_HEAD, "الدائرة المالية", "رئيس الدائرة المالية"),
    ("head_eng", User.Role.DEPARTMENT_HEAD, "دائرة الهندسة", "رئيس دائرة الهندسة"),
    ("emp_finance1", User.Role.EMPLOYEE, "الدائرة المالية", "موظف مالية ١"),
    ("emp_finance2", User.Role.EMPLOYEE, "الدائرة المالية", "موظف مالية ٢"),
    ("emp_eng1", User.Role.EMPLOYEE, "دائرة الهندسة", "موظف هندسة ١"),
    ("council1", User.Role.COUNCIL, None, "لجنة التدقيق / المجلس البلدي"),
]


class Command(BaseCommand):
    help = "Seed demo municipality, departments, users and default reminder rules."

    def handle(self, *args, **options):
        municipality, _ = Municipality.objects.get_or_create(name="بلدية النموذج")
        WorkflowPolicy.objects.get_or_create(municipality=municipality)

        departments = {}
        for name in ("الدائرة المالية", "دائرة الهندسة"):
            departments[name], _ = Department.objects.get_or_create(
                municipality=municipality, name=name
            )

        created_users = 0
        for username, role, dept_name, full_name in USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "role": role,
                    "municipality": municipality,
                    "department": departments.get(dept_name),
                    "full_name_ar": full_name,
                },
            )
            if created:
                user.set_password(PASSWORD)
                user.save()
                created_users += 1

        rules_created = ensure_default_rules(municipality)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded: 1 municipality, {len(departments)} departments, "
            f"{created_users} new users (password: {PASSWORD}), "
            f"{rules_created} reminder rules."
        ))
