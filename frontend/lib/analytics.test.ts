import { describe, expect, it } from "vitest";

import {
  departmentPressure,
  portfolioRates,
  stagePressure,
  type AnalyticsPayload,
} from "./analytics";

/** A payload shaped exactly like GET /api/analytics/. */
function payload(overrides: Partial<AnalyticsPayload> = {}): AnalyticsPayload {
  return {
    generated_at: "2026-09-20T10:00:00Z",
    totals: {
      total: 10,
      open: 6,
      closed: 4,
      overdue: 3,
      high_risk_open: 2,
      recurring_confirmed: 1,
      recurring_flagged: 2,
      with_plan: 5,
      completion_rate: 40,
      overdue_rate: 50,
    },
    by_status: { in_progress: 4, closed: 4, pending_response: 2 },
    by_risk: { high: 2, medium: 3, low: 1 },
    by_engagement_type: { assurance: 7, advisory: 3 },
    by_department: [
      {
        department: 1,
        name: "Finance",
        total: 6,
        open: 4,
        closed: 2,
        overdue: 1,
        in_progress: 3,
        high_risk: 1,
        recurring: 0,
        execution_rate: 33.3,
      },
      {
        department: 2,
        name: "Engineering",
        total: 4,
        open: 2,
        closed: 2,
        overdue: 2,
        in_progress: 1,
        high_risk: 1,
        recurring: 1,
        execution_rate: 50,
      },
    ],
    volume: [{ month: "2026-09-01", created: 3, closed: 1 }],
    implementation: {
      average_step_progress: 42.5,
      steps_total: 8,
      steps_done: 3,
      steps_completion_rate: 37.5,
    },
    recurrence: { confirmed: 1, awaiting_confirmation: 2 },
    ...overrides,
  };
}

describe("portfolioRates", () => {
  it("reads the server's rates rather than recomputing them", () => {
    const rates = portfolioRates(payload());
    expect(rates.total).toBe(10);
    expect(rates.open).toBe(6);
    expect(rates.closed).toBe(4);
    expect(rates.completionRate).toBe(40);
    expect(rates.overdueRate).toBe(50);
  });

  it("reports high risk among OPEN items only", () => {
    // A closed high-risk finding is history, not present exposure.
    expect(portfolioRates(payload()).highRisk).toBe(2);
  });

  it("counts only human-confirmed recurrences", () => {
    // Flagged-but-unconfirmed is a suggestion, and must not be presented
    // as an established recurring finding.
    expect(portfolioRates(payload()).recurring).toBe(1);
  });

  it("survives an empty portfolio without dividing by zero", () => {
    const empty = portfolioRates(
      payload({
        totals: {
          total: 0,
          open: 0,
          closed: 0,
          overdue: 0,
          high_risk_open: 0,
          recurring_confirmed: 0,
          recurring_flagged: 0,
          with_plan: 0,
          completion_rate: 0,
          overdue_rate: 0,
        },
      })
    );
    expect(empty.completionRate).toBe(0);
    expect(empty.overdueRate).toBe(0);
  });
});

describe("departmentPressure", () => {
  it("maps every column the table renders", () => {
    const [first] = departmentPressure(payload());
    expect(first).toMatchObject({
      name: "Engineering",
      inProgress: 1,
      highRisk: 1,
      overdue: 2,
    });
  });

  it("puts the most overdue department first", () => {
    const rows = departmentPressure(payload());
    expect(rows.map((row) => row.name)).toEqual(["Engineering", "Finance"]);
  });

  it("rounds the execution rate for display", () => {
    const finance = departmentPressure(payload()).find((r) => r.name === "Finance");
    expect(finance?.executionRate).toBe(33);
  });
});

describe("stagePressure", () => {
  it("excludes closed work, which is not stuck anywhere", () => {
    const total = stagePressure(payload()).reduce((sum, row) => sum + row.count, 0);
    // 4 in_progress + 2 pending_response; the 4 closed are dropped.
    expect(total).toBe(6);
  });

  it("returns one row per workflow stage even when empty", () => {
    const rows = stagePressure(payload({ by_status: {} }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.count === 0)).toBe(true);
    expect(rows.every((row) => row.label.length > 0)).toBe(true);
  });
});
