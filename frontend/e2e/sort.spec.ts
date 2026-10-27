/**
 * Round 2, 1.3: the register's sort options say what they do, and the rows on
 * screen come in the order the API returns for that option.
 */
import { expect, test } from "@playwright/test";

import { apiGet } from "./support/api";
import { signIn } from "./support/auth";
import { hostileRows } from "./support/hostile";

test.beforeAll(() => {
  hostileRows(); // mixed risk, status and deadlines
});

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: sort labels match their behaviour`, async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, request, "audit");
    await page.evaluate((l) => localStorage.setItem("audit_locale", l), locale);
    await page.goto("/audit/recommendations");
    const select = page.locator("main select").filter({ has: page.locator('option[value="-priority_score"]') }).first();
    await expect(select).toBeVisible();
    const priority = (await select.locator('option[value="-priority_score"]').textContent())!.trim();
    // It sorts by the score Internal Audit sets, not by risk: the label must say so.
    if (locale === "en") {
      expect(priority).not.toBe("Highest priority");
      expect(priority).toMatch(/audit/i);
    } else {
      expect(priority).not.toBe("الأولوية الأعلى");
      expect(priority).toContain("التدقيق");
    }
    // "Risk" means highest severity first, then the nearest deadline.
    await expect(select.locator('option[value="-risk_level,deadline"]')).toHaveCount(1);
  });
}

test("each sort option shows rows in the API's order", async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, request, "audit");
  await page.goto("/audit/recommendations");
  const select = page.locator("main select").filter({ has: page.locator('option[value="-priority_score"]') }).first();
  const values = await select.locator("option").evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  expect(values.length).toBeGreaterThan(5);
  for (const value of values) {
    await select.selectOption(value);
    await expect(page).toHaveURL(new RegExp(`ordering=${encodeURIComponent(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const { body } = await apiGet<{ results: { id: number }[] }>(
      request, "audit", `/api/recommendations/?ordering=${encodeURIComponent(value)}&page=1`
    );
    const expected = body.results.map((r) => `REC-${String(r.id).padStart(4, "0")}`);
    await expect
      .poll(async () => (await page.locator("main table tbody tr td:first-child").allInnerTexts()).map((t) => t.trim()), { message: value })
      .toEqual(expected);
  }
});
