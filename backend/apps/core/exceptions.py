"""Central API exception handling.

Converts domain-level workflow violations into clean 400/409 responses so the
frontend never needs to interpret raw server errors.

Every error response carries a stable machine-readable `code` (plus `params`
for workflow errors). The `detail` text stays English for logs and API
clients; the Arabic/English UI translates by code, so English server wording
never reaches an Arabic screen.
"""
from django.db import IntegrityError
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


class WorkflowError(Exception):
    """Raised when a workflow transition or business rule is violated.

    `code` names the rule (see frontend/lib/i18n `errors`); `params` carries
    the values a message needs, e.g. the incomplete step titles.
    """

    def __init__(self, detail, code="workflow_error", params=None):
        self.detail = detail
        self.code = code
        self.params = params or {}
        super().__init__(detail)


class StorageUnavailable(Exception):
    """File could not be stored (Cloudinary/disk). Never a silent network drop."""

    def __init__(self, detail="Could not store the uploaded file.", code="storage_unavailable"):
        self.detail = detail
        self.code = code
        super().__init__(detail)


def _flatten_messages(value):
    if isinstance(value, dict):
        return [message for item in value.values() for message in _flatten_messages(item)]
    if isinstance(value, (list, tuple)):
        return [message for item in value for message in _flatten_messages(item)]
    return [str(value)]


def _validation_payload(exc, data):
    """DRF's field errors, kept in place, plus their codes.

    Field keys stay at the top level so existing clients keep working; `code`
    and `field_codes` let the UI translate (`required`, `max_value`, ...).
    """
    codes = exc.get_codes()
    if isinstance(data, dict):
        payload = dict(data)
        field_codes = codes if isinstance(codes, dict) else {"non_field_errors": codes}
    else:
        payload = {"non_field_errors": data}
        field_codes = {"non_field_errors": codes}
    messages = _flatten_messages(data)
    payload.setdefault("detail", messages[0] if messages else "Invalid input.")
    payload["code"] = "validation_error"
    payload["field_codes"] = field_codes
    return payload


def api_exception_handler(exc, context):
    if isinstance(exc, WorkflowError):
        body = {"detail": exc.detail, "code": exc.code}
        if exc.params:
            body["params"] = exc.params
        return Response(body, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, IntegrityError):
        # Two requests raced to create a row that may exist once (e.g. one
        # management response per recommendation). The row locks prevent this
        # for workflow actions; anything that still slips through is a clean
        # conflict, never an HTTP 500.
        return Response(
            {"detail": "This action was already recorded.", "code": "duplicate_request"},
            status=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, StorageUnavailable):
        return Response(
            {"detail": exc.detail, "code": exc.code},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    response = exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, ValidationError):
        response.data = _validation_payload(exc, response.data)
    elif isinstance(exc, APIException) and isinstance(response.data, dict):
        codes = exc.get_codes()
        if isinstance(codes, str):
            response.data.setdefault("code", codes)
        wait = getattr(exc, "wait", None)
        if wait is not None:
            response.data.setdefault("params", {"seconds": int(wait)})
    return response
