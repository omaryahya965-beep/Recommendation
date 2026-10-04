"""Write the workflow presentation contract for the frontend.

    python manage.py export_workflow_contract           # rewrite the file
    python manage.py export_workflow_contract --check   # fail if it is stale

The frontend reads frontend/lib/contract/workflow.json for stage order,
status labels, who acts next and every error code, so the browser and the
API describe the workflow from one source.
"""
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

CONTRACT_PATH = Path(settings.BASE_DIR).parent / "frontend" / "lib" / "contract" / "workflow.json"


def render_contract() -> str:
    from apps.core.error_codes import ERROR_CODES, FIELD_ERROR_CODES
    from apps.workflow.presentation import contract

    data = contract()
    data["error_codes"] = sorted(ERROR_CODES)
    data["field_error_codes"] = sorted(FIELD_ERROR_CODES)
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def committed_contract() -> str:
    """The file as committed, without line-ending noise (git may check it
    out with CRLF on Windows)."""
    if not CONTRACT_PATH.exists():
        return ""
    return CONTRACT_PATH.read_bytes().decode("utf-8").replace("\r\n", "\n")


class Command(BaseCommand):
    help = "Export the workflow presentation contract to frontend/lib/contract/workflow.json."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Fail if the file is out of date.")

    def handle(self, *args, **options):
        rendered = render_contract()
        if options["check"]:
            if committed_contract() != rendered:
                raise CommandError(
                    f"{CONTRACT_PATH} is out of date. Run: python manage.py export_workflow_contract"
                )
            self.stdout.write(self.style.SUCCESS("Workflow contract is up to date."))
            return
        CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONTRACT_PATH.write_bytes(rendered.encode("utf-8"))
        self.stdout.write(self.style.SUCCESS(f"Wrote {CONTRACT_PATH}"))
