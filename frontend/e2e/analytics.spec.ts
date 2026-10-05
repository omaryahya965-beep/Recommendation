import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet } from "./support/api";
import { signIn } from "./support/auth";
import type { UserKey } from "./support/env";

interface Totals {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  completion_rate: number;
}

/**
 * One set of definitions: the analytics page, the role dashboard and the
 * register's overdue filter must report the same numbers.
 */
const ROLES: Array<[UserKey, string]> = [
  ["audit", "/audit/analytics"],
  ["head", "/department/analytics"],
  ["employee", "/employee/analytics"],
  ["council", "/council/analytics"],
];

for (const [who, path] of ROLES) {
  test(`${who}: analytics agree with the dashboard and the register`, async ({ page, request }) => {
    const { body: analytics } = await apiGet<{ totals: Totals }>(request, who, "/api/analytics/");
    const { body: dashboard } = await apiGet<{ stats: Totals }>(request, who, "/api/dashboard/");
    for (const key of ["total", "open", "closed", "overdue", "completion_rate"] as const) {
      expect(dashboard.stats[key], key).toBe(analytics.totals[key]);
    }
    const { body: overdueList } = await apiGet<{ count: number }>(
      request,
      who,
      "/api/recommendations/?overdue=true"
    );
    expect(overdueList.count).toBe(analytics.totals.overdue);

    await signIn(page, request, who);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: T.insights.title })).toBeVisible();
    const headline = page.getByTestId("analytics-headline");
    await expect(headline).toBeVisible();
    if (who !== "council") {
      await expect(page.getByTestId("analytics-overdue")).toContainText(String(analytics.totals.overdue));
    }
  });
}

test("audit sees the department comparison and the monthly series", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/analytics");
  await expect(page.getByTestId("analytics-departments")).toBeVisible();
  await expect(page.getByTestId("analytics-volume")).toBeVisible();
  await page.getByTestId("analytics-volume").getByText(T.insights.tableView).click();
  await expect(page.getByTestId("analytics-volume").getByRole("table")).toBeVisible();
});
