"""
WSGI config for config project.

Exposes the WSGI callable ``application``. Vercel detects Django via
``manage.py``, then loads this entrypoint from ``WSGI_APPLICATION``
(``config.wsgi.application``). Do not set ``ASGI_APPLICATION`` — when both
are set, Vercel prefers ASGI.

https://vercel.com/docs/frameworks/full-stack/django
"""

import os
import time

_t0 = time.perf_counter()


def _cs(msg: str) -> None:
    elapsed_ms = (time.perf_counter() - _t0) * 1000
    print(f"[coldstart] +{elapsed_ms:.0f}ms {msg}", flush=True)


_cs("wsgi_module_begin")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
_cs("DJANGO_SETTINGS_MODULE_set")

from django.core.wsgi import get_wsgi_application  # noqa: E402

_cs("imported_get_wsgi_application")

from django.conf import settings  # noqa: E402

_ = settings.INSTALLED_APPS
_cs("settings_loaded")

import django  # noqa: E402

django.setup()
_cs("django.setup_done")

_inner = get_wsgi_application()
_cs("get_wsgi_application_done")

_first_request = True


def application(environ, start_response):
    global _first_request
    if _first_request:
        path = environ.get("PATH_INFO", "")
        t_req = time.perf_counter()
        _cs(f"first_request_enter path={path}")

        def _start(status, headers, exc_info=None):
            _cs(
                f"first_request_status {status} "
                f"handler_ms={(time.perf_counter() - t_req) * 1000:.0f}"
            )
            return start_response(status, headers, exc_info)

        result = _inner(environ, _start)
        _cs(f"first_request_return path={path}")
        _first_request = False
        return result
    return _inner(environ, start_response)
