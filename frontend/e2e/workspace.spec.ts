import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { firstRecommendationOf } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES } from "./support/env";
import { actionPanel, caseUrl, openCase, openSection } from "./support/workspace";

/**
 * The case workspace: the action card first (whose turn, by when, and the
 * form when it is the viewer's turn), the record as collapsible sections, the
 * ten-stage timeline, and the side rail.
 */
test("a reviewer sees whose turn it is, where the case stands, and its record", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeInProgress);
  await signIn(page, request, "audit");
  await openCase(page, "audit", rec.id);

  // Nothing for audit to do while the department implements: no form.
  await expect(page.locator("#case-action")).toContainText(T.workflow.currentAction);
  await expect(actionPanel(page)).toHaveCount(0);

  // The timeline marks the stage the case is in.
  await expect(page.locator('[aria-current="step"]')).toContainText(T.workflow.stages.execution);

  // The plan is the open part of the record; the history starts collapsed.
  await expect(page.locator("#section-plan button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#section-history button[aria-expanded]")).toHaveAttribute("aria-expanded", "false");

  await openSection(page, "history");
  const history = page.locator("#section-history");
  const everything = history.getByRole("button", { name: T.caseView.historyFilters.all });
  await everything.click();
  await expect(everything).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByText(T.caseView.dates.title)).toBeVisible();
});

test("a link from the old tab layout opens the matching section", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeInProgress);
  await signIn(page, request, "audit");
  await page.goto(`${caseUrl("audit", rec.id)}?tab=trail`);
  await expect(page.locator("#section-history button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
});

test("the responsible employee works from one execution desk", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "employee", FIXTURES.financeInProgress);
  await signIn(page, request, "employee");
  await openCase(page, "employee", rec.id);

  const desk = actionPanel(page);
  await expect(desk).toContainText(T.caseView.desk.steps);
  await expect(desk.locator('input[type="file"]')).toHaveCount(1);
  // The uploader lives in the desk only; the evidence section lists files.
  await expect(page.locator("#section-evidence button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('#section-evidence input[type="file"]')).toHaveCount(0);
});
