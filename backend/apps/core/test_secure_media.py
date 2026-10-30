"""Round 2, 2.5: secure_media is idempotent, has an exact --dry-run and a
--revert for rollback. Cloudinary is replaced by an in-memory fake that
remembers each asset's delivery type."""
from io import StringIO
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.core.testing import make_world
from apps.workflow import services
from apps.workflow.models import Evidence, ManagementResponse


class FakeCloudinary:
    """public_id -> delivery type ("upload" = public, "private")."""

    def __init__(self, assets):
        self.assets = dict(assets)
        self.renames = []

    def resource(self, public_id, resource_type="image", type="upload", **kwargs):
        if self.assets.get(public_id) != type:
            raise Exception(f"Resource not found - {public_id}")
        return {"public_id": public_id, "type": type, "resource_type": resource_type}

    def rename(self, from_id, to_id, resource_type="image", type="upload", to_type=None, **kwargs):
        if self.assets.get(from_id) != type:
            raise Exception(f"Resource not found - {from_id}")
        self.assets[from_id] = to_type
        self.renames.append((from_id, type, to_type))
        return {"public_id": to_id, "type": to_type}


class SecureMediaIdempotencyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(
            self.rec, self.users["head"], decision="disagree", justification="no",
            attachment=SimpleUploadedFile("objection.pdf", b"%PDF-1.4"),
        )
        # A second reference to an already-private file, and a missing one.
        Evidence.objects.create(recommendation=self.rec, file="evidence/already.pdf", uploaded_by=self.users["emp"])
        Evidence.objects.create(recommendation=self.rec, file="evidence/gone.pdf", uploaded_by=self.users["emp"])

    def run_command(self, fake, *args):
        from apps.core.cloudinary_storage import CloudinaryMediaStorage

        storage = CloudinaryMediaStorage.__new__(CloudinaryMediaStorage)
        ids = {name: storage._cloudinary_public_id(name) for name in (
            ManagementResponse.objects.get(recommendation=self.rec).attachment.name, "evidence/already.pdf", "evidence/gone.pdf",
        )}
        out = StringIO()
        with mock.patch("apps.core.media_views.cloudinary_ready", return_value=True), mock.patch(
            "apps.core.management.commands.secure_media.configure_cloudinary"
        ), mock.patch("cloudinary.api.resource", side_effect=fake.resource), mock.patch(
            "cloudinary.uploader.rename", side_effect=fake.rename
        ):
            call_command("secure_media", *args, stdout=out, stderr=out)
        return out.getvalue(), ids

    def fake(self):
        from apps.core.cloudinary_storage import CloudinaryMediaStorage

        storage = CloudinaryMediaStorage.__new__(CloudinaryMediaStorage)
        attachment = ManagementResponse.objects.get(recommendation=self.rec).attachment.name
        return FakeCloudinary({
            storage._cloudinary_public_id(attachment): "upload",
            storage._cloudinary_public_id("evidence/already.pdf"): "private",
        })

    def test_dry_run_lists_only_what_will_change_and_changes_nothing(self):
        fake = self.fake()
        for args in ((), ("--dry-run",)):
            out, ids = self.run_command(fake, *args)
            self.assertEqual(fake.renames, [])
            self.assertIn("would make private", out)
            self.assertIn(ids[ManagementResponse.objects.get(recommendation=self.rec).attachment.name], out)
            listed = [line for line in out.splitlines() if line.startswith("would make private")]
            self.assertEqual(len(listed), 1, out)
            self.assertNotIn(ids["evidence/already.pdf"], listed[0])
            self.assertIn("1 to change, 1 already private, 1 missing", out)

    def test_apply_is_idempotent(self):
        fake = self.fake()
        out, _ = self.run_command(fake, "--apply")
        self.assertEqual(len(fake.renames), 1)
        self.assertIn("changed=1 already=1 missing=1 failed=0", out)
        out, _ = self.run_command(fake, "--apply")
        self.assertEqual(len(fake.renames), 1, "a second run changes nothing")
        self.assertIn("changed=0 already=2 missing=1 failed=0", out)

    def test_revert_restores_public_delivery(self):
        fake = self.fake()
        self.run_command(fake, "--apply")
        out, _ = self.run_command(fake, "--revert", "--dry-run")
        self.assertIn("would make public", out)
        self.assertEqual(len(fake.renames), 1)
        self.run_command(fake, "--revert", "--apply")
        self.assertEqual(set(fake.assets.values()), {"upload"})
        self.assertEqual([to for _, _, to in fake.renames[1:]], ["upload", "upload"])

    def test_apply_and_dry_run_together_are_refused(self):
        with self.assertRaises(CommandError):
            self.run_command(self.fake(), "--apply", "--dry-run")
