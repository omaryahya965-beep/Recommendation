from django.test import SimpleTestCase

from config.settings.storage import build_storages, cloudinary_enabled


class StorageConfigTests(SimpleTestCase):
    def test_without_cloudinary_keeps_local_media_and_whitenoise_static(self):
        storages = build_storages(use_cloudinary=False)
        self.assertEqual(
            storages["default"]["BACKEND"],
            "django.core.files.storage.FileSystemStorage",
        )
        self.assertEqual(
            storages["staticfiles"]["BACKEND"],
            "whitenoise.storage.CompressedStaticFilesStorage",
        )

    def test_cloudinary_switches_media_backend_and_keeps_whitenoise(self):
        storages = build_storages(use_cloudinary=True)
        self.assertEqual(
            storages["default"]["BACKEND"],
            "apps.core.cloudinary_storage.CloudinaryMediaStorage",
        )
        self.assertEqual(
            storages["staticfiles"]["BACKEND"],
            "whitenoise.storage.CompressedStaticFilesStorage",
        )

    def test_cloudinary_url_enables_remote_media(self):
        self.assertTrue(
            cloudinary_enabled(cloudinary_url="cloudinary://key:secret@demo")
        )
        self.assertFalse(cloudinary_enabled(cloudinary_url=""))

    def test_three_part_credentials_enable_remote_media(self):
        self.assertTrue(
            cloudinary_enabled(
                cloud_name="demo",
                api_key="key",
                api_secret="secret",
            )
        )
        self.assertFalse(
            cloudinary_enabled(cloud_name="demo", api_key="key", api_secret="")
        )
