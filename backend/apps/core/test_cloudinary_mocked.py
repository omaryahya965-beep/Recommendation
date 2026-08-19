"""Cloudinary storage tests that never call the live API.

The suite runs under config.settings.dev (FileSystemStorage). These tests
exercise CloudinaryMediaStorage with a mocked uploader so they do not need
CLOUDINARY_* credentials.
"""
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import SimpleTestCase

from apps.core.cloudinary_storage import CloudinaryMediaStorage


class MockedCloudinaryUploadTests(SimpleTestCase):
    def setUp(self):
        self.storage = CloudinaryMediaStorage()

    @patch("cloudinary.uploader.upload")
    def test_pdf_upload_sends_resource_type_raw(self, upload):
        upload.return_value = {
            "public_id": "evidence/2026/08/deposit-slip.pdf",
            "resource_type": "raw",
            "format": "pdf",
            "secure_url": (
                "https://res.cloudinary.com/demo/raw/upload/v1/"
                "evidence/2026/08/deposit-slip.pdf"
            ),
        }
        name = self.storage._save(
            "evidence/2026/08/deposit-slip.pdf",
            ContentFile(b"%PDF-1.4 smoke evidence\n"),
        )
        self.assertEqual(upload.call_args.kwargs["resource_type"], "raw")
        self.assertEqual(name, "evidence/2026/08/deposit-slip.pdf")

    @patch("cloudinary.uploader.upload")
    def test_jpeg_upload_sends_resource_type_image(self, upload):
        upload.return_value = {
            "public_id": "evidence/2026/08/photo",
            "resource_type": "image",
            "format": "jpg",
            "secure_url": (
                "https://res.cloudinary.com/demo/image/upload/v1/"
                "evidence/2026/08/photo.jpg"
            ),
        }
        name = self.storage._save(
            "evidence/2026/08/photo.jpg",
            ContentFile(b"\xff\xd8\xff"),
        )
        self.assertEqual(upload.call_args.kwargs["resource_type"], "image")
        self.assertEqual(name, "evidence/2026/08/photo.jpg")

    @patch("cloudinary.uploader.destroy")
    def test_delete_does_not_call_live_api(self, destroy):
        destroy.return_value = {"result": "ok"}
        self.storage.delete("evidence/2026/08/deposit-slip.pdf")
        destroy.assert_called_once()
        self.assertEqual(destroy.call_args.kwargs["resource_type"], "raw")
