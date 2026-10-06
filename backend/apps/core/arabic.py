"""Arabic wording for server-written text (notifications, report summaries).

Counts agree with the number, as the UI does (frontend `plural()`):
one · two · 3–10 · 11–99 · the rest. Dates read as the UI writes them
("6 أكتوبر 2026"); an ISO date inside an Arabic sentence can be reordered
by the browser's bidirectional layout.
"""
import datetime

_MONTHS = (
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
)


def count_phrase(n, *, one, two, plural, accusative, singular):
    """e.g. توصية واحدة · توصيتان · 3 توصيات · 11 توصيةً · 100 توصية."""
    if n == 1:
        return one
    if n == 2:
        return two
    last_two = n % 100
    if 3 <= last_two <= 10:
        return f"{n} {plural}"
    if 11 <= last_two <= 99:
        return f"{n} {accusative}"
    return f"{n} {singular}"


def recommendations(n):
    return count_phrase(
        n, one="توصية واحدة", two="توصيتان", plural="توصيات", accusative="توصيةً", singular="توصية"
    )


def date_ar(value):
    """'2026-10-06' or a date → '6 أكتوبر 2026'. Anything else is returned as given."""
    if isinstance(value, str):
        try:
            value = datetime.date.fromisoformat(value[:10])
        except ValueError:
            return value
    if isinstance(value, datetime.datetime):
        value = value.date()
    if not isinstance(value, datetime.date):
        return value
    return f"{value.day} {_MONTHS[value.month - 1]} {value.year}"


def days(n):
    return count_phrase(n, one="يوم واحد", two="يومان", plural="أيام", accusative="يوماً", singular="يوم")
