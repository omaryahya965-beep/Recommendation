/** External QA: interface items reported from the deployed site. */
import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { signIn } from "./support/auth";
import { caseAfterPartialVerification } from "./support/qa";
import { openSection } from "./support/workspace";

test("progress history never shows [object Object]", async ({ page, request }) => {
  const id = await caseAfterPartialVerification(request);
  await signIn(page, request, "audit");
  await page.goto(`/audit/recommendations/${id}`);
  await openSection(page, "history");
  await page.getByRole("dialog").getByRole("button", { name: T.caseView.historyFilters.all, exact: true }).click();
  const toggles = page.getByRole("dialog").getByRole("button", { name: T.trail.showMetadata });
  await expect(toggles.first()).toBeVisible();
  for (let i = await toggles.count(); i > 0; i -= 1) await toggles.first().click();
  await expect(page.getByRole("dialog").getByText(T.trail.hideMetadata).first()).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("[object Object]");
  await expect(page.getByRole("dialog").getByText(/0% → 100%/).first()).toBeVisible();
});
