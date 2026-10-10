# Proposal (Raqeeb V3): structured finding fields

**Status:** proposal, not implemented. V2 deliberately keeps
`Recommendation.text` as the single stored field.

## Today (V2)

The create wizard writes one labelled text into `Recommendation.text`:

```
العنوان:
…
الوضع القائم:
…
المعيار:
…
```

`backend/apps/audits/finding.py` (`parse_finding`, `case_title`) and its
frontend twin `frontend/lib/finding.ts` derive the title, excerpt and
sections when reading. Known headings: title, condition, criteria, effect,
statement (the recommendation), objective, required action, expected
outcome, success indicator, expected evidence, notes — plus legacy aliases
("الملاحظة", "Finding", "Risks", …). Text without headings falls back to a
preamble. `root_cause` is already a separate field.

This works, but every reader re-parses; search and analytics cannot use a
section ("all findings whose criterion cites regulation X"); an edit that
breaks a heading silently moves text into another section; and AI prompts
receive the whole text instead of the parts they need.

## Proposal

Add nullable columns to `Recommendation` (or a one-to-one `Finding`
model), one per section the wizard already captures:

| Field | Source heading |
|---|---|
| `title` | العنوان |
| `condition` | الوضع القائم |
| `criteria` | المعيار |
| `effect` | الأثر |
| `statement` | التوصية |
| `required_action` | الإجراء المطلوب |
| `expected_evidence` | الأدلة المتوقعة |
| `objective`, `expected_outcome`, `success_indicator`, `notes` | the remaining headings |

`text` stays and remains the source of truth during the transition.

### Steps

1. **Schema** — additive migration, all fields nullable. No behaviour change.
2. **Write both** — the wizard and the draft edit endpoint write the
   fields and the composed `text` (from the same input), so old and new
   readers agree.
3. **Backfill** — a management command parses every existing `text` with
   `parse_finding` into the fields, dry-run first, reporting rows whose text
   has no recognised headings (they keep only the preamble in `condition`)
   and rows where the parse is ambiguous. Idempotent; never touches `text`.
   Run on a Neon branch first, then production, only with approval.
4. **Read fields** — serializers return the fields; `title` / `excerpt`
   come from them; the parser is kept only as the fallback for rows the
   backfill could not structure.
5. **Use them** — section-level search and filters, analytics by criterion,
   AI prompts receiving only the sections they need, follow-up reports
   quoting the statement.
6. **Retire** — once every row is structured, `text` becomes a computed
   value (kept in exports for compatibility).

### Compatibility and risks

- API: fields are added; `text`, `title`, `excerpt` keep their meaning.
- Frozen follow-up snapshots are unaffected (they store their own copy).
- The AuditTrail records draft edits today by field; it would record the
  structured fields the same way.
- Risk: legacy texts with free-form headings. Mitigation: the dry-run
  report and the parser fallback; nothing is lost because `text` is kept.
- Effort: about one sprint including the backfill and its review.
