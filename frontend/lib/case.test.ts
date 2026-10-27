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
