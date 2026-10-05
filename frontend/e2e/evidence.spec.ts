import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet, firstRecommendationOf } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES, uniqueSuffix } from "./support/env";
import { actionPanel, openCase, openSection } from "./support/workspace";

/**
 * Evidence files are served by the authenticated API endpoint. The browser
 * must fetch them with the session token (a plain link would be rejected), and
 * every access is recorded in the audit trail.
 */
// A 1x1 PNG: headless Chromium renders images inline (it has no PDF viewer,
// so a PDF "view" there turns into a download).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

test("an employee uploads evidence, then views and downloads it", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "employee", FIXTURES.financeInProgress);
  const fileName = `proof-${uniqueSuffix()}.png`;

  await signIn(page, request, "employee");
  await openCase(page, "employee", rec.id);
  await actionPanel(page).locator('input[type="file"]').first().setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: PNG,
  });
  await actionPanel(page).getByRole("button", { name: T.evidenceRegister.upload }).click();

  // The uploaded file is listed in the evidence section of the record.
  await openSection(page, "evidence");
  const stem = fileName.replace(/\.png$/, "");
  const item = page.getByTestId("evidence-item").filter({ hasText: stem, visible: true }).first();
  await expect(item).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    item.getByRole("button", { name: T.evidence.view }).click(),
  ]);
  await expect.poll(() => popup.url()).toMatch(/^blob:/);
  await popup.close();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    item.getByRole("button", { name: T.evidence.download }).click(),
  ]);
  expect(download.suggestedFilename()).toContain(stem);
  const path = await download.path();
  expect(path).toBeTruthy();

  // Both accesses went through the audited endpoint.
  const { body } = await apiGet<{ trail: Array<{ action: string }> }>(
    request,
    "audit",
    `/api/recommendations/${rec.id}/`
  );
  const downloads = body.trail.filter((entry) => entry.action === "evidence_downloaded");
  expect(downloads.length).toBeGreaterThanOrEqual(2);
});
