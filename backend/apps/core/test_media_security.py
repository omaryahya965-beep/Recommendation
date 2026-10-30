"""S6: uploaded files are reachable only through authorized endpoints."""
import importlib
import json
from types import SimpleNamespace
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import Resolver404, resolve
from rest_framework.test import APIClient

from apps.core.testing import drive_to_in_progress, finish_steps_and_evidence, make_world
from apps.workflow import services


def client_for(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


class ProtectedFileTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(
            self.rec, self.users["head"], decision="disagree", justification="no",
            attachment=SimpleUploadedFile("objection.pdf", b"%PDF-1.4 objection"),
        )
        self.rec.refresh_from_db()

    def detail(self, who="audit"):
        return client_for(self.users[who]).get(f"/api/recommendations/{self.rec.id}/").json()

    def test_payload_contains_no_raw_storage_url(self):
        body = json.dumps(self.detail())
        self.assertNotIn("/media/", body)
        attachment = self.detail()["response"]["attachment"]
        self.assertTrue(attachment.endswith(f"/api/recommendations/{self.rec.id}/response-attachment/"), attachment)
        self.assertTrue(self.detail()["response"]["attachment_name"].startswith("objection"))

    def test_response_attachment_requires_permission(self):
        path = f"/api/recommendations/{self.rec.id}/response-attachment/"
        self.assertEqual(client_for().get(path).status_code, 401)
        self.assertEqual(client_for(self.users["other_head"]).get(path).status_code, 404)
        res = client_for(self.users["audit"]).get(path)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), b"%PDF-1.4 objection")
        self.assertTrue(self.rec.trail_entries.filter(action="response_attachment_downloaded").exists())

    def test_evidence_payload_and_download_are_protected(self):
        drive = self.rec
        services.review_response(drive, self.users["audit"], accept=True)
        services.submit_report_to_council(self.report, self.users["audit"])
        services.ratify_report(self.report, self.users["council"])
        # The disagreement closes on ratification; use a fresh case for evidence.
        _, _, users2 = self.muni, self.dept, self.users
        from apps.audits.models import Recommendation

        rec2 = Recommendation.objects.create(report=self.report, text="second", risk_level="low")
        rec2.status = Recommendation.Status.ACTION_PLAN_REQUIRED
        rec2.save()
        from apps.core.testing import plan_data

        services.submit_action_plan(rec2, users2["head"], plan_data(users2))
        rec2.refresh_from_db()
        services.review_action_plan(rec2, users2["audit"], approve=True)
        rec2.refresh_from_db()
        finish_steps_and_evidence(users2, rec2)
        data = client_for(users2["emp"]).get(f"/api/recommendations/{rec2.id}/").json()
        self.assertNotIn("/media/", json.dumps(data))
        ev = data["evidence_files"][0]
        self.assertTrue(ev["file"].startswith("proof") and "/" not in ev["file"])
        path = f"/api/evidence/{ev['id']}/download/"
        self.assertEqual(client_for().get(path).status_code, 401)
        self.assertEqual(client_for(users2["other_head"]).get(path).status_code, 404)
        res = client_for(users2["audit"]).get(path)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), b"%PDF-1.4 test")

    def test_no_public_media_route_even_in_debug(self):
        import config.urls

        with override_settings(DEBUG=True):
            reloaded = importlib.reload(config.urls)
            try:
                with self.assertRaises(Resolver404):
                    resolve("/media/evidence/2026/08/x.pdf", urlconf=reloaded)
            finally:
                importlib.reload(config.urls)


class CloudinaryPrivateDeliveryTests(TestCase):
    """Offline checks of what the Cloudinary backend asks for (no network)."""

    def setUp(self):
        import cloudinary

        cloudinary.config(cloud_name="demo", api_key="123", api_secret="abc", secure=True)

    def test_storage_url_is_a_signed_expiring_download(self):
        from apps.core.cloudinary_storage import CloudinaryMediaStorage

        with mock.patch("apps.core.cloudinary_storage.configure_cloudinary"):
            url = CloudinaryMediaStorage().url("evidence/2026/10/proof.pdf")
        self.assertIn("api.cloudinary.com/v1_1/demo/raw/download", url)
        self.assertIn("signature=", url)
        self.assertIn("expires_at=", url)
        self.assertIn("type=private", url)
        self.assertNotIn("res.cloudinary.com", url)

    def test_uploads_are_stored_private(self):
        from apps.core import cloudinary_storage

        with mock.patch("apps.core.cloudinary_storage.configure_cloudinary"), mock.patch(
            "cloudinary.uploader.upload", return_value={"public_id": "evidence/x.pdf"}
        ) as upload:
            cloudinary_storage.CloudinaryMediaStorage()._save("evidence/x.pdf", SimpleUploadedFile("x.pdf", b"x"))
        self.assertEqual(upload.call_args.kwargs["type"], "private")

    def test_direct_upload_signature_covers_the_private_type(self):
        from apps.core.media_views import build_signed_upload_params

        params = build_signed_upload_params("evidence/2026/10", 1, tags="uid_1")
        self.assertEqual(params["type"], "private")


class SecureMediaCommandTests(TestCase):
    """The conversion command renames each referenced asset to the private type."""

    @staticmethod
    def public_asset(public_id, resource_type="image", type="upload", **kwargs):
        # Cloudinary says the asset is stored with the public "upload" type only.
        if type != "upload":
            raise Exception("Resource not found")
        return {"public_id": public_id, "type": type}

    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        services.submit_report_to_department(self.report, self.users["audit"])
        self.rec.refresh_from_db()
        services.submit_response(
            self.rec, self.users["head"], decision="disagree", justification="no",
            attachment=SimpleUploadedFile("objection.pdf", b"%PDF-1.4"),
        )

    def test_apply_renames_upload_to_private(self):
        from io import StringIO

        from django.core.management import call_command

        with mock.patch("apps.core.media_views.cloudinary_ready", return_value=True), mock.patch(
            "apps.core.management.commands.secure_media.configure_cloudinary"
        ), mock.patch("cloudinary.api.resource", side_effect=self.public_asset), mock.patch(
            "cloudinary.uploader.rename"
        ) as rename:
            out = StringIO()
            call_command("secure_media", "--apply", stdout=out)
        self.assertEqual(rename.call_count, 1)
        kwargs = rename.call_args.kwargs
        self.assertEqual((kwargs["type"], kwargs["to_type"]), ("upload", "private"))
        self.assertIn("changed=1", out.getvalue())

    def test_dry_run_changes_nothing(self):
        from io import StringIO

        from django.core.management import call_command

        with mock.patch("apps.core.media_views.cloudinary_ready", return_value=True), mock.patch(
            "apps.core.management.commands.secure_media.configure_cloudinary"
        ), mock.patch("cloudinary.api.resource", side_effect=self.public_asset), mock.patch(
            "cloudinary.uploader.rename"
        ) as rename:
            out = StringIO()
            call_command("secure_media", stdout=out)
        rename.assert_not_called()
        self.assertIn("would make private", out.getvalue())


class SignedLinkTests(TestCase):
    """Round 2, 2.6: the browser can get the signed link without fetching
    api.cloudinary.com cross-origin; local files can never run as a page."""

    def setUp(self):
        import cloudinary

        cloudinary.config(cloud_name="demo", api_key="123", api_secret="abc", secure=True)

    def field_file(self):
        from apps.core.cloudinary_storage import CloudinaryMediaStorage

        with mock.patch("apps.core.cloudinary_storage.configure_cloudinary"):
            storage = CloudinaryMediaStorage()
        return SimpleNamespace(storage=storage, name="evidence/2026/10/proof.pdf")

    def serve(self, params):
        from apps.core.media_views import serve_protected_file

        request = SimpleNamespace(query_params=params)
        with mock.patch("apps.core.cloudinary_storage.configure_cloudinary"):
            return serve_protected_file(self.field_file(), request)

    def test_link_mode_returns_the_signed_url_as_json(self):
        response = self.serve({"link": "1"})
        self.assertEqual(response.status_code, 200)
        body = json.loads(response.content)
        self.assertIn("api.cloudinary.com/v1_1/demo/raw/download", body["url"])
        self.assertIn("signature=", body["url"])
        self.assertEqual(body["name"], "proof.pdf")
        self.assertIn("attachment=0", body["url"])

    def test_download_link_asks_for_an_attachment(self):
        body = json.loads(self.serve({"link": "1", "download": "1"}).content)
        self.assertRegex(body["url"], r"attachment=(1|true|True)")

    def test_plain_request_still_redirects(self):
        response = self.serve({})
        self.assertEqual(response.status_code, 302)
        self.assertIn("signature=", response["Location"])

    def test_local_file_cannot_run_as_a_page(self):
        from django.core.files.base import ContentFile
        from django.core.files.storage import FileSystemStorage

        from apps.core.media_views import serve_protected_file

        import tempfile

        storage = FileSystemStorage(location=tempfile.mkdtemp())
        name = storage.save("evidence/note.txt", ContentFile(b"<script>alert(1)</script>"))
        field_file = SimpleNamespace(storage=storage, name=name, open=lambda mode: storage.open(name, mode))
        response = serve_protected_file(field_file, SimpleNamespace(query_params={}))
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Content-Security-Policy"], "sandbox")
