"""Make existing Cloudinary uploads private (S6).

Files uploaded before CLOUDINARY_DELIVERY_TYPE=private were stored with the
public "upload" type: their plain CDN URL serves the file to anyone. This
command converts every evidence file and response attachment the database
references to the configured private type. The database keeps the same names.

    python manage.py secure_media            # list what would change
    python manage.py secure_media --apply    # convert
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

    for name in Evidence.objects.exclude(file="").values_list("file", flat=True):
        yield name
    for name in ManagementResponse.objects.exclude(attachment="").values_list("attachment", flat=True):
        yield name


class Command(BaseCommand):
    help = "Convert existing public Cloudinary uploads to the private delivery type."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Convert (default: dry run).")

    def handle(self, *args, apply=False, **options):
        from apps.core.media_views import cloudinary_ready

        if not cloudinary_ready():
            raise CommandError("Cloudinary is not configured; local files are already served only through the API.")
        import cloudinary.uploader

        configure_cloudinary()
        target = delivery_type()
        if target == "upload":
            raise CommandError('CLOUDINARY_DELIVERY_TYPE is "upload" (public); set it to "private" first.')
        storage = CloudinaryMediaStorage()
        converted = skipped = failed = 0
        for name in referenced_names():
            public_id = storage._cloudinary_public_id(name)
            resource_type = resource_type_for_name(name)
            if not apply:
                self.stdout.write(f"would convert {resource_type}:{public_id} upload -> {target}")
                continue
            try:
                cloudinary.uploader.rename(
                    public_id, public_id, resource_type=resource_type,
                    type="upload", to_type=target, invalidate=True,
                )
                converted += 1
            except Exception as exc:  # already private, or missing
                message = str(exc)
                if "not found" in message.lower():
                    skipped += 1
                else:
                    failed += 1
                    self.stderr.write(f"failed {public_id}: {message}")
        if apply:
            self.stdout.write(self.style.SUCCESS(
                f"converted={converted} already-private-or-missing={skipped} failed={failed}"
            ))
