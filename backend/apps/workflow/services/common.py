"""Helpers shared by every workflow service module."""


def _policy(report):
    """The municipality's workflow policy, or None when none is configured."""
    return getattr(report.municipality, "workflow_policy", None)
