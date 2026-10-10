"""The suite must be physically unable to reach real systems."""
import socket
import urllib.request

from django.conf import settings
from django.db import connection
from django.test import SimpleTestCase

from config.test_runner import (
    OutboundNetworkBlocked,
    UnsafeTestConfiguration,
    assert_local_databases,
)


class TestSafetyGuardTests(SimpleTestCase):
    def test_database_is_local(self):
        host = (connection.settings_dict.get("HOST") or "").lower()
        self.assertIn(host, {"", "localhost", "127.0.0.1", "::1", "postgres", "db"})

    def test_remote_database_is_refused(self):
        with self.assertRaises(UnsafeTestConfiguration):
            assert_local_databases(
                {"default": {"HOST": "ep-example-123.eu-central-1.aws.neon.tech"}}
            )

    def test_local_database_is_accepted(self):
        assert_local_databases({"default": {"HOST": "localhost"}})
        assert_local_databases({"default": {"HOST": "127.0.0.1"}})

    def test_ai_is_forced_to_local_provider(self):
        self.assertEqual(settings.AI_PROVIDER, "local")
        self.assertEqual(settings.AI_API_KEY, "")

    def test_cloudinary_is_disabled(self):
        self.assertFalse(getattr(settings, "CLOUDINARY_URL", ""))
        self.assertEqual(
            settings.STORAGES["default"]["BACKEND"],
            "django.core.files.storage.FileSystemStorage",
        )

    def test_outbound_socket_is_blocked(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            with self.assertRaises(OutboundNetworkBlocked):
                sock.connect(("93.184.216.34", 443))
        finally:
            sock.close()

    def test_outbound_http_is_blocked(self):
        with self.assertRaises(Exception) as ctx:
            urllib.request.urlopen("http://93.184.216.34/", timeout=2)
        self.assertIn("Blocked outbound connection", str(ctx.exception))
