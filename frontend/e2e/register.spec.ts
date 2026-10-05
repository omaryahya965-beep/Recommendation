import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet } from "./support/api";
import { signIn } from "./support/auth";

/**
 * Desktop register and navigation: the badge counts the viewer's own turn,
 * filters arrive as removable chips, and a filter set can be saved.
 */
test("the navigation badge counts the cases waiting on the viewer", async ({ page, request }) => {
  const { body: counts } = await apiGet<{ recommendations: number }>(request, "head", "/api/nav-counts/");
  const { body: list } = await apiGet<{ count: number }>(request, "head", "/api/recommendations/?my_turn=true");
  expect(counts.recommendations).toBe(list.count);

  await signIn(page, request, "head");
  await page.goto("/department/dashboard");
  const link = page.getByRole("navigation").getByRole("link", { name: new RegExp(T.register.title) }).first();
  if (counts.recommendations > 0) {
    await expect(link).toContainText(String(counts.recommendations));
    await expect(link).toContainText(T.nav.badgeLabel.replace("{n}", String(counts.recommendations)));
  }
});

test("audit filters the register by who holds the case and saves the view", async ({ page, request }) => {
  const { body } = await apiGet<{ count: number }>(request, "audit", "/api/recommendations/?waiting_on=department");

  await signIn(page, request, "audit");
  await page.goto("/audit/recommendations");
  await page.getByRole("button", { name: T.filters.title }).click();
  await page.getByRole("combobox", { name: T.register.waitingColumn, exact: true }).selectOption("department");
  await expect(page).toHaveURL(/waiting_on=department/);
  const chip = page.getByRole("button", {
    name: T.register.chipWaitingOn.replace("{who}", T.workflow.waitingOn.department),
  });
  await expect(chip).toBeVisible();
  // The count shown is the server's count for the same filter.
  await expect(page.locator("span", { hasText: T.register.resultCount }).first()).toContainText(String(body.count));

  // Save the filter set, clear it, then bring it back from the saved view.
  await page.getByRole("button", { name: T.register.saveView }).click();
  await page.getByLabel(T.register.viewName).fill("بانتظار الدوائر");
  await page.getByRole("button", { name: T.common.save, exact: true }).click();
  await chip.click();
  await expect(page).not.toHaveURL(/waiting_on=/);

  await page.reload();
  await page.getByRole("button", { name: "بانتظار الدوائر", exact: true }).click();
  await expect(page).toHaveURL(/waiting_on=department/);
});

test("sorting by deadline uses the binding deadline", async ({ page, request }) => {
  const { body } = await apiGet<{ results: Array<{ deadline: string | null }> }>(
    request,
    "audit",
    "/api/recommendations/?ordering=deadline&page_size=50"
  );
  const dated = body.results.map((row) => row.deadline).filter((value): value is string => Boolean(value));
  expect(dated).toEqual([...dated].sort());

  await signIn(page, request, "audit");
  await page.goto("/audit/recommendations");
  await page.getByLabel(T.register.sortBy).selectOption("deadline");
  await expect(page).toHaveURL(/ordering=deadline/);
});
