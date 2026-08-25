"""Helpers for FileField values that already live in storage."""
from __future__ import annotations


ALLOWED_STORED_PREFIXES = ("evidence/", "responses/")


def bind_stored_name(instance, field_name: str, stored_name: str) -> None:
    """Attach an existing storage key without uploading bytes again."""
    field = instance._meta.get_field(field_name)
    file_field = field.attr_class(instance, field, stored_name)
    file_field._committed = True
    setattr(instance, field_name, file_field)


def validate_stored_name(stored_name: str, *, allowed_prefix: str) -> str:
    name = (stored_name or "").replace("\\", "/").lstrip("/")
    if ".." in name or not name.startswith(allowed_prefix):
        raise ValueError("Invalid stored file reference.")
    if not any(name.startswith(prefix) for prefix in ALLOWED_STORED_PREFIXES):
        raise ValueError("Invalid stored file reference.")
    return name
