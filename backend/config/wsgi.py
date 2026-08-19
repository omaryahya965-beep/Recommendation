"""
WSGI config for config project.

Exposes the WSGI callable ``application``. Vercel detects Django via
``manage.py``, then loads this entrypoint from ``WSGI_APPLICATION``
(``config.wsgi.application``). Do not set ``ASGI_APPLICATION`` — when both
are set, Vercel prefers ASGI.

https://vercel.com/docs/frameworks/full-stack/django
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

application = get_wsgi_application()
