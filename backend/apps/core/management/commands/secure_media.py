"""Make existing Cloudinary uploads private (S6), safely and repeatably.

Files uploaded before CLOUDINARY_DELIVERY_TYPE=private were stored with the
public "upload" type: their plain CDN URL serves the file to anyone. This
command converts every evidence file and response attachment the database
references to the configured private type. The database keeps the same names.

It asks Cloudinary for each asset's current type first, so it is idempotent:
an asset that is already private is left alone, and a second run changes
nothing. Without --apply it only lists what it would change.

    python manage.py secure_media                 # dry run (same as --dry-run)
    python manage.py secure_media --apply         # convert public -> private
    python manage.py secure_media --revert        # dry run of the rollback
    python manage.py secure_media --revert --apply   # private -> public (rollback)

Rollback: `--revert --apply` makes the same assets public again; then set
CLOUDINARY_DELIVERY_TYPE=upload and redeploy, so new uploads are public too.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.core.cloudinary_storage import (
    CloudinaryMediaStorage,
    configure_cloudinary,
    delivery_type,
    resource_type_for_name,
)


def referenced_names():
    from apps.workflow.models import Evidence, ManagementResponse

    seen = set()
    for model, field in ((Evidence, "file"), (ManagementResponse, "attachment")):
        for name in model.objects.exclude(**{field: ""}).values_list(field, flat=True).order_by(field):
            if name and name not in seen:
                seen.add(name)
                yield name


def _not_found(exc) -> bool:
    return "not found" in str(exc).lower()


class Command(BaseCommand):
    help = "Convert existing public Cloudinary uploads to the private delivery type (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Make the changes (default: dry run).")
        parser.add_argument("--dry-run", action="store_true", help="Only list what would change (the default).")
        parser.add_argument("--revert", action="store_true", help="Roll back: make the assets public again.")

    def handle(self, *args, apply=False, dry_run=False, revert=False, **options):
        from apps.core.media_views import cloudinary_ready

        if apply and dry_run:
            raise CommandError("Use either --apply or --dry-run, not both.")
        if not cloudinary_ready():
            raise CommandError("Cloudinary is not configured; local files are already served only through the API.")
        import cloudinary.api
        import cloudinary.uploader

        configure_cloudinary()
        private = delivery_type()
        if private == "upload":
            raise CommandError('CLOUDINARY_DELIVERY_TYPE is "upload" (public); set it to "private" first.')
        source, target = (private, "upload") if revert else ("upload", private)
        verb = "public" if revert else "private"

        def stored_as(public_id, resource_type, kind):
            try:
                cloudinary.api.resource(public_id, resource_type=resource_type, type=kind)
                return True
            except Exception as exc:
                if _not_found(exc):
                    return False
                raise

        storage = CloudinaryMediaStorage()
        changed = already = missing = failed = 0
        pending = []
        for name in referenced_names():
            public_id = storage._cloudinary_public_id(name)
            resource_type = resource_type_for_name(name)
            try:
                if stored_as(public_id, resource_type, source):
                    pending.append((public_id, resource_type))
                elif stored_as(public_id, resource_type, target):
                    already += 1
                else:
                    missing += 1
                    self.stderr.write(f"missing in Cloudinary: {resource_type}:{public_id}")
            except Exception as exc:
                failed += 1
                self.stderr.write(f"could not read {public_id}: {exc}")

        if not apply:
            for public_id, resource_type in pending:
                self.stdout.write(f"would make {verb} {resource_type}:{public_id} ({source} -> {target})")
            self.stdout.write(
                f"{len(pending)} to change, {already} already {verb}, {missing} missing"
                + (f", {failed} unreadable" if failed else "")
                + ". Nothing was changed (dry run)."
            )
            return

        for public_id, resource_type in pending:
            try:
                cloudinary.uploader.rename(
                    public_id, public_id, resource_type=resource_type,
                    type=source, to_type=target, invalidate=True,
                )
                changed += 1
            except Exception as exc:
                if _not_found(exc):
                    already += 1  # changed by a concurrent run
                else:
                    failed += 1
                    self.stderr.write(f"failed {public_id}: {exc}")
        style = self.style.SUCCESS if not failed else self.style.WARNING
        self.stdout.write(style(f"changed={changed} already={already} missing={missing} failed={failed}"))
