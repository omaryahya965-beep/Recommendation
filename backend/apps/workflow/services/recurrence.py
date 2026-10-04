"""Recurrence confirmation (human-in-the-loop)."""
from django.db import transaction as db_transaction

from apps.audits.models import Recommendation
from apps.core.exceptions import WorkflowError
from apps.core.models import log_action


S = Recommendation.Status


@db_transaction.atomic
def confirm_recurrence(recommendation, user, confirmed):
    if not recommendation.is_recurring:
        raise WorkflowError("This recommendation is not flagged as possibly recurring.")
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
