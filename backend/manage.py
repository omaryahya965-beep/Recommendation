#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    # Local CLI uses dev settings. Vercel sets VERCEL=1 and must use prod
    # (wsgi.py also defaults to prod). An explicit DJANGO_SETTINGS_MODULE
    # in the environment always wins.
    default_settings = (
        "config.settings.prod" if os.environ.get("VERCEL") else "config.settings.dev"
    )
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", default_settings)
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
