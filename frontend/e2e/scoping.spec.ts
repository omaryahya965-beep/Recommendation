import { expect, test } from "@playwright/test";

import { apiGet, findReport, firstRecommendationOf } from "./support/api";
import { FIXTURES } from "./support/env";

/**
 * Row-level scoping, checked at the API the UI uses. Each role must see its
 * own slice and nothing else, whatever URL it asks for.
 */
test.describe("role scoping", () => {
  test("a department head cannot see another department's case", async ({ request }) => {
    const eng = await firstRecommendationOf(request, "headEng", FIXTURES.engineeringPending);
    const asFinance = await apiGet(request, "head", `/api/recommendations/${eng.id}/`);
    expect(asFinance.status).toBe(404);
    const asEngineering = await apiGet(request, "headEng", `/api/recommendations/${eng.id}/`);
    expect(asEngineering.status).toBe(200);
  });

  test("an employee sees only cases assigned to them", async ({ request }) => {
    const { body } = await apiGet<{ results: Array<{ responsible_employee: string | null }> }>(
      request,
      "employee",
      "/api/recommendations/?page_size=100"
    );
    expect(body.results.length).toBeGreaterThan(0);
    for (const row of body.results) expect(row.responsible_employee).toBe("موظف مالية ١");
  });

  test("drafts stay inside internal audit", async ({ request }) => {
    const draft = await findReport(request, "audit", FIXTURES.financeDraft);
    for (const who of ["head", "employee", "council"] as const) {
      const res = await apiGet(request, who, `/api/reports/${draft.id}/`);
      expect(res.status, who).toBe(404);
    }
  });

  test("the council sees issued work across departments", async ({ request }) => {
    const eng = await firstRecommendationOf(request, "council", FIXTURES.engineeringPending);
    expect(eng.id).toBeGreaterThan(0);
  });
});
