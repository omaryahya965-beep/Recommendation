import { expect, test } from "@playwright/test";

import { apiGet } from "./support/api";
import { signIn } from "./support/auth";

/**
 * Team progress shows exact per-employee counts from the API, and each
 * employee's "all cases" link opens the register filtered to them.
 */
test("department head sees team workload and opens one employee's cases", async ({ page, request }) => {
  const { body } = await apiGet<{
    employees: Array<{ employee: { id: number; name: string }; open: number }>;
  }>(request, "head", "/api/team/workload/");
  const busiest = [...body.employees].sort((a, b) => b.open - a.open)[0];
  expect(busiest.open).toBeGreaterThan(0);

  const { body: list } = await apiGet<{ count: number }>(
    request,
    "head",
    `/api/recommendations/?responsible_employee=${busiest.employee.id}&open=true`
  );
  expect(list.count).toBe(busiest.open);

  await signIn(page, request, "head");
  await page.goto("/department/team-progress");
  await expect(page.getByTestId("team-workload")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(busiest.employee.name) }).first().click();
  await expect(page).toHaveURL(new RegExp(`responsible_employee=${busiest.employee.id}`));
});
