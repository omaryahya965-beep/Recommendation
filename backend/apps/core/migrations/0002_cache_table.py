"""Create the database cache table used by DRF throttling.

Throttle counters must be shared across serverless instances, so the cache
backend is Django's DatabaseCache on the existing Neon connection. The table
is created here rather than by a manual `createcachetable` step, so a deploy
that runs migrations is automatically ready to serve throttled endpoints.

Idempotent and non-destructive: it only adds a table, and skips if present.
"""
from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    # createcachetable is a no-op when the table already exists.
    call_command("createcachetable", "core_cache", verbosity=0)


def drop_cache_table(apps, schema_editor):
    schema_editor.execute("DROP TABLE IF EXISTS core_cache")


class Migration(migrations.Migration):

    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.RunPython(create_cache_table, drop_cache_table),
    ]
