"""Upper bounds for free text the API accepts.

Large enough for real audit writing, small enough that one record cannot make
pages slow or exports unwieldy. The UI shows a counter against the same values
(frontend/lib/limits.ts).
"""
# The structured finding + recommendation text of one case.
RECOMMENDATION_TEXT_MAX = 20_000
# Root cause, justifications, notes, comments, review and verification text.
NOTE_MAX = 5_000
