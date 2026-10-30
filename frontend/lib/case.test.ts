import { describe, expect, it } from "vitest";

import { latestVerification } from "./case";
import type { RecommendationDetail } from "./types";

describe("latestVerification (BUG-15)", () => {
  it("picks the most recent decision whatever the list order", () => {
    const rec = {
      verifications: [
        { id: 2, decision: "sufficient", created_at: "2026-10-27T01:50:00+00:00" },
        { id: 1, decision: "partial", created_at: "2026-10-27T01:49:00+00:00" },
      ],
    } as unknown as RecommendationDetail;
    expect(latestVerification(rec)?.decision).toBe("sufficient");
    const reversed = { verifications: [...(rec.verifications ?? [])].reverse() } as unknown as RecommendationDetail;
    expect(latestVerification(reversed)?.decision).toBe("sufficient");
  });

  it("is null without decisions", () => {
    expect(latestVerification({ verifications: [] } as unknown as RecommendationDetail)).toBeNull();
  });
});

describe("verification summary follows the latest decision (round 2, 2.3)", () => {
  // The API lists decisions newest first; nothing may depend on that order.
  const apiOrder = [
    { id: 7, decision: "sufficient", created_at: "2026-10-27T10:00:00+00:00", reviewed_by_detail: { id: 3, username: "late", full_name_ar: "Late" } },
    { id: 5, decision: "partial", created_at: "2026-10-27T09:00:00+00:00", reviewed_by_detail: { id: 2, username: "early", full_name_ar: "Early" } },
  ];

  it("section facts and people name the newest decision in either list order", async () => {
    const { sectionFacts, casePeople } = await import("./viewmodels/caseView");
    for (const verifications of [apiOrder, [...apiOrder].reverse()]) {
      const rec = { verifications, approvals: [], trail: [] } as unknown as RecommendationDetail;
      expect(sectionFacts(rec).latestVerification).toBe("sufficient");
      expect(casePeople(rec).find((p) => p.part === "verifier")?.name).toBe("Late");
    }
  });

  it("breaks a timestamp tie by id", () => {
    const tie = [
      { id: 8, decision: "partial", created_at: "2026-10-27T10:00:00+00:00" },
      { id: 9, decision: "sufficient", created_at: "2026-10-27T10:00:00+00:00" },
    ];
    for (const verifications of [tie, [...tie].reverse()]) {
      expect(latestVerification({ verifications } as unknown as RecommendationDetail)?.id).toBe(9);
    }
  });

  it("history lists decisions newest first in either list order", async () => {
    const { verificationsNewestFirst } = await import("./case");
    for (const verifications of [apiOrder, [...apiOrder].reverse()]) {
      expect(verificationsNewestFirst({ verifications } as unknown as RecommendationDetail).map((v) => v.id)).toEqual([7, 5]);
    }
  });
});
