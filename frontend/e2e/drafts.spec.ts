import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet, findReport } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES, uniqueSuffix } from "./support/env";
import { actionPanel, openCase } from "./support/workspace";

test("audit edits a draft recommendation before issuing the report", async ({ page, request }) => {
  const draftReport = await findReport(request, "audit", FIXTURES.financeDraft);
  const { body } = await apiGet<{ recommendations: Array<{ id: number }> }>(
    request,
    "audit",
    `/api/reports/${draftReport.id}/`
  );
  const recId = body.recommendations[0].id;
  const newTitle = `مراجعة صلاحيات النظام — معدلة ${uniqueSuffix()}`;

  await signIn(page, request, "audit");
  await openCase(page, "audit", recId);
  await actionPanel(page).getByRole("link", { name: T.create.editAction }).click();
  await expect(page).toHaveURL(new RegExp(`/audit/recommendations/${recId}/edit`));

  await page.getByLabel(T.create.findingTitle).fill(newTitle);
  // Walk to the review step and save.
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: T.create.next }).click();
  }
  await page.getByRole("button", { name: T.create.saveChanges }).click();

  await expect(page).toHaveURL(new RegExp(`/audit/recommendations/${recId}\\?saved=1`));
  await expect(page.getByText(T.create.editSaved)).toBeVisible();
  await expect(page.getByRole("heading", { name: newTitle })).toBeVisible();

  const { body: detail } = await apiGet<{ text: string; trail: Array<{ action: string }> }>(
    request,
    "audit",
    `/api/recommendations/${recId}/`
  );
  expect(detail.text).toContain(newTitle);
  expect(detail.trail.some((entry) => entry.action === "recommendation_updated")).toBe(true);
});

test("the department never sees the draft", async ({ request }) => {
  const draftReport = await findReport(request, "audit", FIXTURES.financeDraft);
  const { body } = await apiGet<{ recommendations: Array<{ id: number }> }>(
    request,
    "audit",
    `/api/reports/${draftReport.id}/`
  );
  const res = await apiGet(request, "head", `/api/recommendations/${body.recommendations[0].id}/`);
  expect(res.status).toBe(404);
});
