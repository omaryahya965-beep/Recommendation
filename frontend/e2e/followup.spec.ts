import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet } from "./support/api";
import { signIn } from "./support/auth";
import { isoDate } from "./support/workspace";

/**
 * Follow-up reports state the moment they describe ("as of") and freeze it.
 */
test("audit previews, saves and the council reads a follow-up report", async ({ page, request }) => {
  const start = isoDate(-30);
  const end = isoDate(0);

  await signIn(page, request, "audit");
  await page.goto("/audit/followup-reports");
  await page.getByLabel(T.followup.from).fill(start);
  await page.getByLabel(T.followup.to).fill(end);
  await page.getByRole("button", { name: T.followup.generateAction }).click();

  const report = page.getByTestId("followup-report").first();
  await expect(report).toBeVisible();
  await expect(report.getByTestId("followup-as-of")).toBeVisible();
  await expect(report.getByText(T.followup.openAtEnd).first()).toBeVisible();
  await expect(report.getByText(T.followup.departments).first()).toBeVisible();

  await page.getByRole("button", { name: T.followup.saveAction }).click();
  await expect(page.getByText(T.followup.savedNotice)).toBeVisible();

  const { body } = await apiGet<{
    results: Array<{ id: number; snapshot: { methodology_version: number; as_of_date: string } }>;
  }>(request, "council", "/api/followup-reports/");
  const saved = body.results[0];
  expect(saved.snapshot.methodology_version).toBe(2);
  expect(saved.snapshot.as_of_date).toBe(end);

  await signIn(page, request, "council");
  await page.goto("/council/followup-reports");
  await page.getByRole("button", { name: T.followup.viewReport }).first().click();
  await expect(page.getByTestId("followup-report").first().getByTestId("followup-as-of")).toBeVisible();
});
