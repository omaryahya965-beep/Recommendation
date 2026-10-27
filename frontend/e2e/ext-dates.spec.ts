/**
 * External QA: date-only values (deadlines, target dates) are calendar days.
 * They must read the same in every time zone, not shift to the day before
 * west of UTC.
 */
import { expect, test } from "@playwright/test";

import { apiGet, apiPost } from "./support/api";
import { signIn } from "./support/auth";
import { caseInPlanStage } from "./support/qa";

const TARGET = "2027-03-15";

for (const timezoneId of ["America/Los_Angeles", "UTC", "Pacific/Kiritimati"]) {
  test.describe(`time zone ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("a plan's target date shows the same calendar day", async ({ page, request }) => {
      const id = await caseInPlanStage(request);
      const { body: emps } = await apiGet<{ results: { id: number; username: string }[] }>(request, "head", "/api/employees/");
      const emp = emps.results.find((e) => e.username === "emp_finance1")!;
      const plan = await apiPost(request, "head", `/api/recommendations/${id}/action-plan/`, {
        responsible_employee: emp.id, target_date: TARGET, steps: [{ title: "QA date step" }],
      });
      expect(plan.status).toBe(200);
      await signIn(page, request, "head");
      await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
      await page.goto(`/department/recommendations/${id}`);
      const main = page.locator("main");
      await expect(main.getByText("15 March 2027").first()).toBeVisible();
      await expect(main.getByText("14 March 2027")).toHaveCount(0);
    });
  });
}
