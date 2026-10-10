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

import os
import shutil
import tempfile

from django.conf import settings
from django.test.runner import DiscoverRunner

from config.safety import (  # noqa: F401 - re-exported for tests
    CLOUDINARY_ENV,
    OutboundNetworkBlocked,
    UnsafeTestConfiguration,
    assert_local_databases as _assert_local_databases,
    install_network_guard,
    uninstall_network_guard,
)


def assert_local_databases(databases=None) -> None:
    _assert_local_databases(settings.DATABASES if databases is None else databases)


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
