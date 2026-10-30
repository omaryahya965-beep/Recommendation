"""Recurrence confirmation (human-in-the-loop)."""

from apps.audits.models import Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import log_action

from .common import locked_transition


S = Recommendation.Status


@locked_transition
def confirm_recurrence(recommendation, user, confirmed):
    if not recommendation.is_recurring:
        raise WorkflowError(
            "This recommendation is not flagged as possibly recurring.",
            code="not_flagged_recurring",
        )
    if recommendation.recurrence_confirmed:
        raise WorkflowError(
            "This recurrence was already confirmed.", code="recurrence_already_reviewed"
        )
    recommendation.recurrence_confirmed = confirmed
    if not confirmed:
        recommendation.is_recurring = False
        recommendation.similar_recommendation = None
        recommendation.similarity_score = None
    recommendation.save()
    log_action(
        user, "recurrence_reviewed", recommendation=recommendation,
        report=recommendation.report, confirmed=confirmed,
    )
    return recommendation
