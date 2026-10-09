import { expect, test } from "@playwright/test";

import { REPORT_STATUS_LABELS, T } from "../lib/i18n/ar";
import { findReport } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES } from "./support/env";

/**
 * The audit report page as an engagement workspace: header and lifecycle,
 * what happens next (with the action when it is audit's move), the
 * engagement details and the recommendations.
 */
test("a draft report says what happens next and keeps every draft editable", async ({ page, request }) => {
  const report = await findReport(request, "audit", FIXTURES.financeDraft);
  await signIn(page, request, "audit");
  await page.goto(`/audit/reports/${report.id}`);

  await expect(page.getByTestId("report-header")).toContainText(report.title);
  await expect(page.locator('[aria-current="step"]')).toContainText(REPORT_STATUS_LABELS.draft);

  const next = page.getByTestId("report-next");
  await expect(next.getByRole("heading", { name: T.reportView.next.draft })).toBeVisible();
  await expect(next.getByRole("button", { name: T.reports.submitToDepartment })).toBeEnabled();
  await expect(next.getByRole("link", { name: T.reports.addRecommendation })).toHaveAttribute(
    "href",
    `/audit/recommendations/new?report=${report.id}`
  );

  const rows = page.getByTestId("report-recommendation");
  await expect(rows.first()).toBeVisible();
  const id = await rows.first().getAttribute("data-id");
  await expect(rows.first().getByRole("link", { name: T.reportView.edit })).toHaveAttribute(
    "href",
    `/audit/recommendations/${id}/edit`
  );
  await expect(page.getByRole("complementary", { name: T.reportView.detailsTitle })).toContainText(T.reportView.scopeTitle);
});

test("a ratified report has no report action and lists its recommendations to open", async ({ page, request }) => {
  const report = await findReport(request, "audit", FIXTURES.financeInProgress);
  await signIn(page, request, "audit");
  await page.goto(`/audit/reports/${report.id}`);

  const next = page.getByTestId("report-next");
  await expect(next.getByRole("heading", { name: T.reportView.next.ratified })).toBeVisible();
  await expect(next.getByRole("button")).toHaveCount(0);
  const first = page.getByTestId("report-recommendation").first();
  await expect(first.getByRole("link", { name: T.reportView.edit })).toHaveCount(0);
  await expect(first.getByRole("link").first()).toHaveAttribute("href", /\/audit\/recommendations\/\d+$/);
});
