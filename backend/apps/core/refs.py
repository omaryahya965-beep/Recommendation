"""Human references shown to users, written exactly as the frontend shows
them (`recordCode` in frontend/lib/format.ts): REC-0008, RPT-0005."""

import re


def record_code(pk, prefix="REC"):
    return f"{prefix}-{int(pk):04d}"


_REPORT_REF = re.compile(r"^RPT-?0*(\d+)$", re.IGNORECASE)
_CASE_REF = re.compile(r"^(?:REC-?)?0*(\d+)$", re.IGNORECASE)


def parse_reference(text):
    """("case", id), ("report", id) or None for what a user typed.

    The same rules as `parseSearch` in frontend/lib/searchQuery.ts:
    REC-0041, REC-41, rec41 and 41 name a case; RPT-5 and RPT-0005 a report.
    """
    text = (text or "").strip()
    match = _REPORT_REF.match(text)
    if match:
        return "report", int(match.group(1))
    match = _CASE_REF.match(text)
    if match:
        return "case", int(match.group(1))
    return None
