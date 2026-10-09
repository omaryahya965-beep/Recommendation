import { describe, expect, it } from "vitest";

import { parseSearch, searchListUrl } from "./searchQuery";

describe("parseSearch", () => {
  it("reads case references in every written form", () => {
    for (const q of ["REC-0008", "rec-8", "REC8", "8", " 0008 "]) expect(parseSearch(q)).toEqual({ kind: "case", id: 8 });
  });

  it("reads report references", () => {
    for (const q of ["RPT-0005", "rpt-5", "RPT5"]) expect(parseSearch(q)).toEqual({ kind: "report", id: 5 });
  });

  it("keeps everything else as words", () => {
    expect(parseSearch("تقرير المالية")).toEqual({ kind: "text", text: "تقرير المالية" });
    expect(parseSearch("REC-8 cash")).toEqual({ kind: "text", text: "REC-8 cash" });
  });

  it("asks for a report's cases, or for matching words", () => {
    expect(searchListUrl({ kind: "report", id: 5 })).toBe("/api/recommendations/?report=5&page_size=8");
    expect(searchListUrl({ kind: "text", text: "ضبط السلف" })).toBe(
      `/api/recommendations/?search=${encodeURIComponent("ضبط السلف")}&page_size=8`
    );
  });
});
