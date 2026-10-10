"""Add any missing default reminder rules to existing municipalities.

Safe by design for production data:

* dry run by default: prints what WOULD be added and changes nothing;
* --apply adds only the missing (offset, recipient) pairs;
* never edits, disables or deletes a rule an administrator configured.

    python manage.py ensure_reminder_defaults                       # preview
    python manage.py ensure_reminder_defaults --apply               # all municipalities
    python manage.py ensure_reminder_defaults --municipality "بلدية البيرة" --apply
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.notifications.services import ensure_default_rules, missing_default_rules
from apps.organizations.models import Municipality


class Command(BaseCommand):
    help = "Add missing default reminder rules (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument("--municipality", help="Only this municipality (exact name).")
        parser.add_argument("--apply", action="store_true", help="Write the missing rules.")

    def handle(self, *args, **options):
        municipalities = Municipality.objects.all()
        if options["municipality"]:
            municipalities = municipalities.filter(name=options["municipality"])
            if not municipalities.exists():
                raise CommandError(f"No municipality named {options['municipality']!r}.")

        total = 0
        for municipality in municipalities:
            missing = missing_default_rules(municipality)
            total += len(missing)
            label = ", ".join(f"{role}:{offset:+d}" for offset, role in missing) or "none"
            self.stdout.write(f"{municipality.name}: missing {len(missing)} ({label})")
            if options["apply"] and missing:
                with transaction.atomic():
                    created = ensure_default_rules(municipality)
                self.stdout.write(self.style.SUCCESS(f"  added {created} rule(s)"))

        if not options["apply"]:
            self.stdout.write(self.style.WARNING(
                f"Dry run: {total} rule(s) would be added. Re-run with --apply to write them."
            ))
