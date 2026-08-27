from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.media_views import build_signed_upload_params
from apps.workflow.models import Evidence
from apps.workflow.tests import drive_to_in_progress, make_world


class MediaSignTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["emp"])

    def test_local_storage_disables_direct_upload(self):
        res = self.client.post(
            "/api/media/sign/",
            {"filename": "proof.pdf", "purpose": "evidence"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["direct_upload"])
        self.assertEqual(res.data["max_bytes"], 20 * 1024 * 1024)

    @override_settings(MAX_UPLOAD_SIZE_MB=20)
    def test_vercel_without_cloudinary_caps_at_4mb(self):
        from apps.core.media_views import max_upload_bytes

        with patch.dict("os.environ", {"VERCEL": "1"}):
            self.assertEqual(max_upload_bytes(direct_upload=False), 4 * 1024 * 1024)
            self.assertEqual(max_upload_bytes(direct_upload=True), 20 * 1024 * 1024)

    def test_sign_requires_auth(self):
        self.client.force_authenticate(None)
        res = self.client.post("/api/media/sign/", {"filename": "proof.pdf"}, format="json")
        self.assertEqual(res.status_code, 401)


class EvidenceUploadApiTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        self.rec.refresh_from_db()
        self.client = APIClient()
        self.client.force_authenticate(self.users["emp"])

    @patch("apps.ai.services.evidence_analyzer.analyze_evidence")
    def test_multipart_upload_does_not_block_on_ai(self, analyze):
        res = self.client.post(
            f"/api/recommendations/{self.rec.id}/evidence/",
            {"file": SimpleUploadedFile("proof.pdf", b"%PDF-1.4 evidence"), "notes": "scan"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 200)
        analyze.assert_not_called()
        self.assertEqual(self.rec.evidence_files.count(), 1)

    def test_stored_name_attaches_without_reuploading(self):
        res = self.client.post(
            f"/api/recommendations/{self.rec.id}/evidence/",
            {"stored_name": "evidence/2026/08/proof.pdf", "notes": "cloudinary"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        ev = Evidence.objects.get(recommendation=self.rec)
        self.assertEqual(ev.file.name, "evidence/2026/08/proof.pdf")

    def test_rejects_stored_name_outside_evidence_folder(self):
        res = self.client.post(
            f"/api/recommendations/{self.rec.id}/evidence/",
            {"stored_name": "responses/secret.pdf"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_rejects_path_traversal_stored_name(self):
        res = self.client.post(
            f"/api/recommendations/{self.rec.id}/evidence/",
            {"stored_name": "evidence/../../etc/passwd.pdf"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)


class EvidenceDeleteApiTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        drive_to_in_progress(self.users, self.report, self.rec)
        self.rec.refresh_from_db()
        self.client = APIClient()
        self.client.force_authenticate(self.users["emp"])

    def _upload(self):
        res = self.client.post(
            f"/api/recommendations/{self.rec.id}/evidence/",
            {"file": SimpleUploadedFile("proof.pdf", b"%PDF-1.4 evidence"), "notes": "scan"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 200)
        return Evidence.objects.get(recommendation=self.rec)

    def test_employee_deletes_own_file(self):
        ev = self._upload()
        res = self.client.post(f"/api/recommendations/{self.rec.id}/evidence/{ev.id}/delete/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.rec.evidence_files.count(), 0)
        self.assertEqual(len(res.data["evidence_files"]), 0)

    def test_missing_file_returns_404(self):
        res = self.client.post(f"/api/recommendations/{self.rec.id}/evidence/99999/delete/")
        self.assertEqual(res.status_code, 404)

    def test_audit_cannot_delete(self):
        ev = self._upload()
        self.client.force_authenticate(self.users["audit"])
        res = self.client.post(f"/api/recommendations/{self.rec.id}/evidence/{ev.id}/delete/")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(self.rec.evidence_files.count(), 1)


class CloudinarySignReadyTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["emp"])

    @override_settings(
        CLOUDINARY_URL="",
        CLOUDINARY_CLOUD_NAME="demo",
        CLOUDINARY_API_KEY="key",
        CLOUDINARY_API_SECRET="secret",
    )
    @patch("apps.core.media_views.configure_cloudinary")
    def test_ready_cloudinary_returns_signed_params(self, _configure):
        class Cfg:
            cloud_name = "demo"
            api_key = "key"
            api_secret = "secret"

        with patch("cloudinary.config", return_value=Cfg()), patch(
            "cloudinary.utils.api_sign_request", return_value="signed"
        ) as sign:
            res = self.client.post(
                "/api/media/sign/",
                {"filename": "proof.pdf", "purpose": "evidence"},
                format="json",
            )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["direct_upload"])
        self.assertEqual(res.data["signature"], "signed")
        self.assertEqual(res.data["resource_type"], "raw")
        self.assertIn("evidence/", res.data["folder"])
        signed = sign.call_args[0][0]
        self.assertEqual(signed["overwrite"], "false")
        self.assertEqual(signed["use_filename"], "true")
        self.assertEqual(signed["unique_filename"], "true")
        self.assertEqual(res.data["fields"]["overwrite"], "false")
        self.assertNotIn(True, signed.values())
        self.assertNotIn(False, signed.values())


class SignedUploadParamsTests(SimpleTestCase):
    def test_string_to_sign_matches_cloudinary_form_body(self):
        params = build_signed_upload_params("evidence/2026/08", 1787826341)
        to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params))
        self.assertEqual(
            to_sign,
            "folder=evidence/2026/08&overwrite=false&timestamp=1787826341"
            "&unique_filename=true&use_filename=true",
        )
