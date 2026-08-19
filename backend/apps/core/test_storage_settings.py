from django.test import SimpleTestCase

from config.settings.storage import build_storages


class StorageConfigTests(SimpleTestCase):
    def test_without_bucket_keeps_local_media_and_whitenoise_static(self):
        storages = build_storages(bucket_name="")
        self.assertEqual(
            storages["default"]["BACKEND"],
            "django.core.files.storage.FileSystemStorage",
        )
        self.assertEqual(
            storages["staticfiles"]["BACKEND"],
            "whitenoise.storage.CompressedStaticFilesStorage",
        )

    def test_bucket_name_switches_media_to_s3_compatible_backend(self):
        storages = build_storages(
            bucket_name="audit-media",
            region_name="auto",
            endpoint_url="https://example.r2.cloudflarestorage.com",
        )
        self.assertEqual(storages["default"]["BACKEND"], "storages.backends.s3.S3Storage")
        options = storages["default"]["OPTIONS"]
        self.assertEqual(options["bucket_name"], "audit-media")
        self.assertEqual(options["region_name"], "auto")
        self.assertEqual(options["endpoint_url"], "https://example.r2.cloudflarestorage.com")
        self.assertEqual(
            storages["staticfiles"]["BACKEND"],
            "whitenoise.storage.CompressedStaticFilesStorage",
        )
