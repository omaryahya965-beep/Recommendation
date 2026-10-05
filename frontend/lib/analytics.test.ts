import { describe, expect, it } from "vitest";

import { decisionSeries, departmentPressure, stagePressure, type DepartmentRow } from "./analytics";

const row = (overrides: Partial<DepartmentRow>): DepartmentRow => ({
  department: 1,
  name: "المالية",
  total: 10,
  open: 5,
  closed: 5,
  closed_implemented: 4,
  overdue: 0,
  overdue_rate: 0,
  in_progress: 3,
  high_risk: 1,
  recurring: 0,
  execution_rate: 40,
  ...overrides,
});

describe("stagePressure", () => {
  it("lists the nine open stages in lifecycle order, closed excluded", () => {
    const rows = stagePressure({ by_stage: { execution: 4, closed: 9 } });
    expect(rows).toHaveLength(9);
    expect(rows[0].id).toBe("preparation");
    expect(rows.find((item) => item.id === "execution")?.count).toBe(4);
    expect(rows.some((item) => item.id === "closed")).toBe(false);
  });

  it("shows zero for stages with nothing waiting", () => {
    expect(stagePressure({ by_stage: {} }).every((item) => item.count === 0)).toBe(true);
  });
});

describe("departmentPressure", () => {
  it("puts the most overdue department first, then open high risk", () => {
    const rows = departmentPressure({
      by_department: [
        row({ department: 1, overdue: 1, high_risk: 0 }),
        row({ department: 2, overdue: 3 }),
        row({ department: 3, overdue: 1, high_risk: 4 }),
      ],
    });
    expect(rows.map((item) => item.department)).toEqual([2, 3, 1]);
  });
});

describe("decisionSeries", () => {
  it("aligns council decisions to the volume months, zero-filling gaps", () => {
    const series = decisionSeries({
      volume: [
        { month: "2026-08-01", created: 1, closed: 0 },
        { month: "2026-09-01", created: 0, closed: 2 },
      ],
      decisions: {
        closure_decisions: 3,
        closed: 2,
        reopened: 1,
        reopen_rate: 33.3,
        ratified: 1,
        per_month: [{ month: "2026-09-01", closed: 2, reopened: 1, ratified: 0 }],
      },
    });
    expect(series).toEqual([
      { month: "2026-08-01", closed: 0, reopened: 0 },
      { month: "2026-09-01", closed: 2, reopened: 1 },
    ]);
  });
});
