/** External QA: after saving a follow-up report the page stops saying it is unsaved. */
import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet } from "./support/api";
import { signIn } from "./support/auth";
import { isoDate } from "./support/workspace";

test("a saved follow-up no longer warns that it is unsaved, and saves the previewed period", async ({ page, request }) => {
  const start = isoDate(-20);
  const end = isoDate(-1);
  await signIn(page, request, "audit");
  await page.goto("/audit/followup-reports");
  await page.getByLabel(T.followup.from).fill(start);
  await page.getByLabel(T.followup.to).fill(end);
  await page.getByRole("button", { name: T.followup.generateAction }).click();
  await expect(page.getByTestId("followup-report").first()).toBeVisible();
  await expect(page.getByText(T.followup.sessionOnly)).toBeVisible();

  // Editing the dates after the preview must not change what is saved.
  await page.getByLabel(T.followup.from).fill(isoDate(-5));
  await page.getByRole("button", { name: T.followup.saveAction }).click();
  await expect(page.getByText(T.followup.savedNotice)).toBeVisible();
  await expect(page.getByText(T.followup.sessionOnly)).toHaveCount(0);
  await expect(page.getByText(T.followup.previewNotice)).toHaveCount(0);

  const { body } = await apiGet<{ results: Array<{ period_start: string; period_end: string }> }>(
    request, "audit", "/api/followup-reports/"
  );
  expect([body.results[0].period_start, body.results[0].period_end]).toEqual([start, end]);
});

test("audit can delete a saved follow-up report after confirming; the council cannot", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/followup-reports");
  await page.getByLabel(T.followup.from).fill(isoDate(-10));
  await page.getByLabel(T.followup.to).fill(isoDate(-1));
  await page.getByRole("button", { name: T.followup.generateAction }).click();
  await page.getByRole("button", { name: T.followup.saveAction }).click();
  await expect(page.getByText(T.followup.savedNotice)).toBeVisible();
  const { body: before } = await apiGet<{ count: number }>(request, "audit", "/api/followup-reports/");
  await page.getByRole("button", { name: T.followup.deleteReport }).first().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(T.followup.deleteBody);
  await dialog.getByRole("button", { name: T.followup.deleteReport }).click();
  await expect.poll(async () => (await apiGet<{ count: number }>(request, "audit", "/api/followup-reports/")).body.count).toBe(before.count - 1);

  await signIn(page, request, "council");
  await page.goto("/council/followup-reports");
  await expect(page.getByRole("button", { name: T.followup.viewReport }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: T.followup.deleteReport })).toHaveCount(0);
});
