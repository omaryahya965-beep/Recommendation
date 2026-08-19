class AIError(Exception):
    """Raised when an AI operation cannot complete. Never a workflow error."""

    def __init__(self, detail, code="ai_error", http_status=400):
        self.detail = detail
        self.code = code
        self.http_status = http_status
        super().__init__(detail)


class AIUnavailable(AIError):
    def __init__(self, detail="AI unavailable"):
        super().__init__(detail, code="ai_unavailable", http_status=503)


class AIValidationError(AIError):
    def __init__(self, detail="AI returned invalid structured output."):
        super().__init__(detail, code="ai_invalid_output", http_status=502)
