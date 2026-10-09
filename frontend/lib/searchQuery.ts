/**
 * What the global search box was given: a case reference (REC-0008, REC-8,
 * or a bare number), a report reference (RPT-0005), or words to match.
 */
export type SearchQuery =
  | { kind: "case"; id: number }
  | { kind: "report"; id: number }
  | { kind: "text"; text: string };

export function parseSearch(raw: string): SearchQuery {
  const text = raw.trim();
  const report = /^RPT-?0*(\d+)$/i.exec(text);
  if (report) return { kind: "report", id: Number(report[1]) };
  const rec = /^(?:REC-?)?0*(\d+)$/i.exec(text);
  if (rec) return { kind: "case", id: Number(rec[1]) };
  return { kind: "text", text };
}

/** The recommendation list request for a report reference or words. */
export function searchListUrl(query: Exclude<SearchQuery, { kind: "case" }>, pageSize = 8): string {
  return query.kind === "report"
    ? `/api/recommendations/?report=${query.id}&page_size=${pageSize}`
    : `/api/recommendations/?search=${encodeURIComponent(query.text)}&page_size=${pageSize}`;
}
