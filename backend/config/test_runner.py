"""Test runner that makes the suite unable to touch real systems.

Every settings module points TEST_RUNNER here, so `manage.py test` is guarded
no matter which DJANGO_SETTINGS_MODULE is active. Before a single test runs it:

1. refuses to start unless every configured database is local (or a CI service
   container), so the suite can never create or drop tables on Neon;
2. forces the deterministic local AI provider and blanks the API key, so no
   test can reach a paid model even if a developer's `.env` configures one;
3. ignores Cloudinary credentials, so uploads stay on a throwaway local disk;
4. blocks outbound network connections from Python code. Tests that need an
   HTTP response must mock it; anything that slips through fails loudly.

Database traffic is unaffected: psycopg connects through libpq, not through
Python sockets.
"""
from __future__ import annotations

import ipaddress
import os
import shutil
import socket
import tempfile

from django.conf import settings
from django.test.runner import DiscoverRunner

# Hosts the suite may use for its database. Anything else is treated as a
# shared or production server.
SAFE_DB_HOSTS = {"", "localhost", "127.0.0.1", "::1", "postgres", "db"}

CLOUDINARY_ENV = (
    "CLOUDINARY_URL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
)


class UnsafeTestConfiguration(RuntimeError):
    """Raised when the test run could reach a non-local system."""


class OutboundNetworkBlocked(ConnectionError):
    """Raised when code under test opens a non-loopback connection."""


def assert_local_databases(databases=None) -> None:
    databases = settings.DATABASES if databases is None else databases
    for alias, config in databases.items():
        host = str(config.get("HOST") or "").strip().lower()
        if host in SAFE_DB_HOSTS:
            continue
        raise UnsafeTestConfiguration(
            f"Refusing to run tests: database '{alias}' points to host '{host}'. "
            "Tests may only use a local or CI database. Set TEST_DATABASE_URL to "
            "a local server (see backend/scripts/start_test_db.ps1)."
        )


def _is_loopback(host) -> bool:
    if host is None:
        return False
    if isinstance(host, bytes):
        host = host.decode(errors="ignore")
    host = str(host).strip().lower()
    if host in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(host.split("%", 1)[0]).is_loopback
    except ValueError:
        return False


_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex


def _address_host(address):
    if isinstance(address, tuple) and address:
        return address[0]
    # AF_UNIX sockets pass a path; those never leave the machine.
    return "localhost"


def _guarded_connect(sock, address):
    if not _is_loopback(_address_host(address)):
        raise OutboundNetworkBlocked(
            f"Blocked outbound connection to {address!r} during tests. "
            "Mock the HTTP call instead of reaching a real service."
        )
    return _real_connect(sock, address)


def _guarded_connect_ex(sock, address):
    if not _is_loopback(_address_host(address)):
        raise OutboundNetworkBlocked(
            f"Blocked outbound connection to {address!r} during tests."
        )
    return _real_connect_ex(sock, address)


def install_network_guard() -> None:
    socket.socket.connect = _guarded_connect
    socket.socket.connect_ex = _guarded_connect_ex


def uninstall_network_guard() -> None:
    socket.socket.connect = _real_connect
    socket.socket.connect_ex = _real_connect_ex


def neutralize_external_services() -> str:
    """Force local AI and local storage. Returns the temp media directory."""
    for name in CLOUDINARY_ENV:
        os.environ.pop(name, None)
        if hasattr(settings, name):
            setattr(settings, name, "")
    settings.AI_PROVIDER = "local"
    settings.AI_API_KEY = ""
    settings.AI_MODEL = "heuristic-v1"
    media_root = tempfile.mkdtemp(prefix="raqeeb-test-media-")
    settings.MEDIA_ROOT = media_root
    storages = dict(getattr(settings, "STORAGES", {}) or {})
    storages["default"] = {"BACKEND": "django.core.files.storage.FileSystemStorage"}
    settings.STORAGES = storages
    return media_root


class SafeTestRunner(DiscoverRunner):
    def setup_test_environment(self, **kwargs):
        assert_local_databases()
        self._media_root = neutralize_external_services()
        install_network_guard()
        super().setup_test_environment(**kwargs)

    def teardown_test_environment(self, **kwargs):
        super().teardown_test_environment(**kwargs)
        uninstall_network_guard()
        media_root = getattr(self, "_media_root", None)
        if media_root:
            shutil.rmtree(media_root, ignore_errors=True)
