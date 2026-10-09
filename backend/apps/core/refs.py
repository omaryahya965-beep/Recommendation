"""Human references shown to users, written exactly as the frontend shows
them (`recordCode` in frontend/lib/format.ts): REC-0008, RPT-0005."""


def record_code(pk, prefix="REC"):
    return f"{prefix}-{int(pk):04d}"
