"""Run the daily reminder pass.

Schedule with Windows Task Scheduler / cron:
    python manage.py send_reminders

Idempotent: running it any number of times per day never duplicates a
notification (deterministic dedupe keys + DB unique constraint).
"""
from django.core.management.base import BaseCommand

from apps.notifications.services import run_reminders


class Command(BaseCommand):
    help = "Evaluate reminder rules and create due notifications (idempotent)."

    def handle(self, *args, **options):
        created = run_reminders()
        self.stdout.write(self.style.SUCCESS(f"Reminders created: {created}"))
