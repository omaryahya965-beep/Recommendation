import { expect, test } from "@playwright/test";

import { T } from "../../lib/i18n/ar";
import { findReport } from "../support/api";
import { signIn } from "../support/auth";
import { FIXTURES } from "../support/env";
import { expectNoHorizontalScroll } from "../support/layout";

test("a draft report on a phone: compact stage, next step, cards, and the actions pinned below", async ({ page, request }) => {
  const report = await findReport(request, "audit", FIXTURES.financeDraft);
  await signIn(page, request, "audit");
  await page.goto(`/audit/reports/${report.id}`);

  await expect(page.getByTestId("report-header")).toContainText(report.title);
  await expect(page.getByText(T.caseView.stageProgress.replace("{n}", "1").replace("{total}", "5"))).toBeVisible();
  const next = page.getByTestId("report-next");
  await expect(next).toBeVisible();
  // One copy of each action, in the sticky bar rather than the card.
  await expect(next.getByRole("button")).toHaveCount(0);
  const submit = page.getByRole("button", { name: T.reports.submitToDepartment });
  await expect(submit).toHaveCount(1);
  await expect(submit).toBeInViewport();
  await expect(page.getByTestId("report-recommendation").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
