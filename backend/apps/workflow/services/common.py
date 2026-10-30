"""Helpers shared by every workflow service module."""
import functools

from django.db import transaction as db_transaction


def _policy(report):
    """The municipality's workflow policy, or None when none is configured."""
    return getattr(report.municipality, "workflow_policy", None)


def lock_for_update(instance):
    """Lock this row until the transaction ends and reload it.

    Every workflow action checks a status, then writes. Without the lock two
    identical requests both pass the check (READ COMMITTED) and both write:
    duplicate audit-trail entries, duplicate notifications, or an
    IntegrityError (HTTP 500). Locked, the second request waits, reloads the
    new status and is refused by the normal guard (409).
    """
    type(instance)._base_manager.select_for_update().filter(pk=instance.pk).exists()
    instance.refresh_from_db()
    return instance


def locked_transition(func):
    """Run a workflow service atomically with its first argument row-locked.

    The single concurrency pattern for every status-changing operation; the
    first positional argument is the Recommendation or AuditReport it acts on.
    """

    @functools.wraps(func)
    def wrapper(instance, *args, **kwargs):
        with db_transaction.atomic():
            lock_for_update(instance)
            return func(instance, *args, **kwargs)

    return wrapper
