import { describe, expect, it } from "vitest";

import type { RecommendationListItem } from "@/lib/types";

import { rank } from "./queues";

function item(id: number, overrides: Partial<RecommendationListItem> = {}): RecommendationListItem {
  return {
    id,
    overdue: false,
    risk_level: "medium",
    deadline: null,
    target_date: null,
    priority_score: 50,
    ...overrides,
  } as RecommendationListItem;
}

function inDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("action ranking", () => {
  it("puts department-overdue first, then risk, then the nearest binding deadline", () => {
    const ranked = rank([
      {
        key: "upcoming_deadlines",
        href: "#",
        block: {
          count: 4,
          items: [
            item(1, { risk_level: "low", deadline: inDays(2) }),
            item(2, { risk_level: "high", deadline: inDays(20) }),
            item(3, { risk_level: "high", deadline: inDays(5) }),
            item(4, { overdue: true, risk_level: "low" }),
          ],
        },
      },
    ]);
    expect(ranked.map((entry) => entry.item.id)).toEqual([4, 3, 2, 1]);
  });

  it("orders by the binding deadline, not the plan's own date (W1)", () => {
    const ranked = rank([
      {
        key: "returned_for_more_evidence",
        href: "#",
        block: {
          count: 2,
          items: [
            // Plan date is near, but audit set a later binding deadline.
            item(1, { target_date: inDays(1), deadline: inDays(10) }),
            item(2, { target_date: inDays(30), deadline: inDays(3) }),
          ],
        },
      },
    ]);
    expect(ranked.map((entry) => entry.item.id)).toEqual([2, 1]);
  });

  it("lists a case once, under the first queue that holds it", () => {
    const shared = item(9);
    const ranked = rank([
      { key: "overdue", href: "#", block: { count: 1, items: [shared] } },
      { key: "upcoming_deadlines", href: "#", block: { count: 1, items: [shared] } },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].queue).toBe("overdue");
  });
});
