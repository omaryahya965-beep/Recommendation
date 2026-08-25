"""Central API exception handling.

Converts domain-level workflow violations into clean 400/409 responses so the
frontend never needs to interpret raw server errors.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class WorkflowError(Exception):
    """Raised when a workflow transition or business rule is violated."""

    def __init__(self, detail, code="workflow_error"):
        self.detail = detail
        self.code = code
        super().__init__(detail)


class StorageUnavailable(Exception):
    """File could not be stored (Cloudinary/disk). Never a silent network drop."""

    def __init__(self, detail="Could not store the uploaded file.", code="storage_unavailable"):
        self.detail = detail
        self.code = code
        super().__init__(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, WorkflowError):
        return Response(
            {"detail": exc.detail, "code": exc.code},
            status=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, StorageUnavailable):
        return Response(
            {"detail": exc.detail, "code": exc.code},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return exception_handler(exc, context)
