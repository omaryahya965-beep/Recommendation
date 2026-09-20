"""One place that defines what "similar" and "recurring" mean.

Three different numbers used to govern this, in three different files, and
they disagreed: the flag written onto the recommendation used 0.85, the UI
labelled matches "likely recurring" at 0.80, and the display floor was a
hard-coded 0.52. A finding could therefore be flagged as recurring on the
record while the panel below it called the same match merely "related".

The vocabulary is deliberately distinct:

``RELATED``
    Above the display floor. Worth a human glance, nothing more.
``LIKELY_RECURRING``
    Strong score *and* corroboration (same department, shared root cause, or
    substantial content overlap). Still only a suggestion.
``recurring``
    A state on the recommendation, set only when internal audit confirms it.
    No threshold in this file can produce it.
"""
import os


def _env_float(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, "") or default)
    except (TypeError, ValueError):
        return default
    return min(1.0, max(0.0, value))


# Retrieval floor: below this, two findings share only common audit vocabulary.
CANDIDATE_MIN_SCORE = _env_float("SIMILARITY_CANDIDATE_MIN", 0.45)

# Nothing weaker than this is ever put in front of a user.
DISPLAY_MIN_SCORE = _env_float("SIMILARITY_DISPLAY_MIN", 0.52)

# Strong enough to propose recurrence, subject to corroboration.
LIKELY_RECURRING_MIN_SCORE = _env_float("SIMILARITY_LIKELY_MIN", 0.80)

# Strong enough to pre-flag on the record for audit to confirm or dismiss.
AUTO_FLAG_MIN_SCORE = _env_float("SIMILARITY_AUTO_FLAG_MIN", 0.85)

# How many matches to show.
DISPLAY_LIMIT = int(os.environ.get("SIMILARITY_DISPLAY_LIMIT", "3") or 3)

# Bound on lazily repaired embeddings per request, so a request never turns
# into an unbounded write storm on a cold dataset.
MAX_BACKFILL_PER_CALL = int(os.environ.get("SIMILARITY_BACKFILL_LIMIT", "25") or 25)


def _validate() -> None:
    """The thresholds must stay ordered or the labels stop meaning anything."""
    ordered = (
        CANDIDATE_MIN_SCORE,
        DISPLAY_MIN_SCORE,
        LIKELY_RECURRING_MIN_SCORE,
        AUTO_FLAG_MIN_SCORE,
    )
    if list(ordered) != sorted(ordered):
        raise ValueError(
            "Similarity thresholds must satisfy "
            "candidate <= display <= likely_recurring <= auto_flag; got "
            f"{ordered}."
        )


_validate()
