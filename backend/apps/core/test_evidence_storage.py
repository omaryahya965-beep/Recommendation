from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework.exceptions import ValidationError

from apps.core.cloudinary_storage import (
    CloudinaryMediaStorage,
    configure_cloudinary,
    resource_type_for_name,
)
from apps.workflow.serializers import EvidenceSerializer, validate_upload


class ResourceTypeTests(SimpleTestCase):
    def test_pdfs_and_office_docs_are_raw(self):
        for name in (
            "evidence/2026/08/deposit-slip.pdf",
            "responses/justification.docx",
            "notes.txt",
            "table.xlsx",
            "legacy.doc",
            "data.csv",
            "bundle.zip",
        ):
            self.assertEqual(resource_type_for_name(name), "raw", name)

    def test_allowed_images_are_image(self):
        for name in ("photo.png", "scan.jpg", "scan.JPEG"):
            self.assertEqual(resource_type_for_name(name), "image", name)


class CloudinaryUrlShapeTests(SimpleTestCase):
    def setUp(self):
        configure_cloudinary(cloud_name="demo", api_key="key", api_secret="secret")
        self.storage = CloudinaryMediaStorage()

    def test_pdf_url_uses_raw_upload_path(self):
        url = self.storage.url("evidence/2026/08/deposit-slip.pdf")
        self.assertIn("/raw/upload/", url)
        self.assertTrue(url.startswith("https://"))

    def test_jpeg_url_uses_image_upload_path(self):
        url = self.storage.url("evidence/2026/08/photo.jpg")
        self.assertIn("/image/upload/", url)
        self.assertTrue(url.startswith("https://"))


class EvidenceFileUrlTests(SimpleTestCase):
    def test_absolute_cloudinary_url_is_not_prefixed_with_api_host(self):
        request = RequestFactory().get("/")
        obj = type("E", (), {})()
        obj.file = type(
            "F",
            (),
            {
                "url": "https://res.cloudinary.com/demo/raw/upload/v1/evidence/deposit-slip.pdf"
            },
        )()
        url = EvidenceSerializer(context={"request": request}).get_file_url(obj)
        self.assertEqual(
            url,
            "https://res.cloudinary.com/demo/raw/upload/v1/evidence/deposit-slip.pdf",
        )

    def test_relative_media_url_is_absolutized_for_local_dev(self):
        request = RequestFactory().get("/")
        obj = type("E", (), {})()
        obj.file = type("F", (), {"url": "/media/evidence/deposit-slip.pdf"})()
        url = EvidenceSerializer(context={"request": request}).get_file_url(obj)
        self.assertTrue(url.endswith("/media/evidence/deposit-slip.pdf"))
        self.assertTrue(url.startswith("http://"))


class UploadValidationStillAppliesTests(SimpleTestCase):
    def test_rejects_disallowed_extension_before_storage(self):
        with self.assertRaises(ValidationError):
            validate_upload(SimpleUploadedFile("malware.exe", b"MZ"))

    @override_settings(MAX_UPLOAD_SIZE_MB=1)
    def test_rejects_oversized_file_before_storage(self):
        payload = b"x" * (2 * 1024 * 1024)
        with self.assertRaises(ValidationError):
            validate_upload(SimpleUploadedFile("proof.pdf", payload))

    def test_allows_pdf_within_limit(self):
        file = validate_upload(SimpleUploadedFile("deposit-slip.pdf", b"%PDF-1.4"))
        self.assertEqual(file.name, "deposit-slip.pdf")
