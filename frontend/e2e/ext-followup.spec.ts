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
