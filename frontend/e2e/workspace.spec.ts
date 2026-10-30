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

  // The record file starts as closed tiles (the action and dates stay in view);
  // a tile opens its part below the row.
  for (const id of ["finding", "response", "plan", "evidence", "verification", "history"]) {
    await expect(page.locator(`#section-${id} button[aria-expanded]`).first()).toHaveAttribute("aria-expanded", "false");
  }
  await openSection(page, "plan");
  await expect(page.locator("#section-plan-content")).toBeVisible();

  await openSection(page, "history");
  const history = page.locator("#section-history-content");
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
  // The section's own toggle (evidence cards hold their own, for the AI review).
  await openSection(page, "evidence");
  await expect(page.locator('#section-evidence-content input[type="file"]')).toHaveCount(0);
});

test("a case outside the viewer's scope says so and leads back to the register", async ({ page, request }) => {
  const engineering = await firstRecommendationOf(request, "headEng", FIXTURES.engineeringPending);
  await signIn(page, request, "head");
  await page.goto(caseUrl("department_head", engineering.id));
  await expect(page.getByRole("heading", { name: T.caseView.unavailableTitle })).toBeVisible();
  await expect(page.getByText(T.errors.notFoundDescription)).toBeVisible();
  await expect(page.getByRole("link", { name: T.register.title }).last()).toHaveAttribute(
    "href",
    "/department/recommendations"
  );
});

test("at 1024px the case gets the full column and the timeline is not cut off", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "employee", FIXTURES.financeInProgress);
  await page.setViewportSize({ width: 1024, height: 800 });
  await signIn(page, request, "employee");
  await openCase(page, "employee", rec.id);
  const card = await page.locator("#case-action").boundingBox();
  // With the sidebar open, a side rail beside the forms squeezed them to ~390px.
  expect(card?.width ?? 0).toBeGreaterThan(600);
  const timeline = page.getByRole("region", { name: T.caseView.timelineTitle });
  const overflow = await timeline.evaluate((section) => {
    const scroller = section.querySelector(".overflow-x-auto") as HTMLElement | null;
    return scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the evidence ledger keeps View and Download inside its column", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeAwaitingClosure);
  await signIn(page, request, "audit");
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openCase(page, "audit", rec.id);
    await openSection(page, "evidence");
    const item = page.getByTestId("evidence-item").filter({ visible: true }).first();
    const view = item.getByRole("button", { name: T.evidence.view });
    await expect(view).toBeVisible();
    const section = await page.locator("#section-evidence-content").boundingBox();
    const button = await view.boundingBox();
    const viewport = page.viewportSize()!;
    expect(button && button.x >= 0 && button.x + button.width <= viewport.width, `View button inside the page at ${width}px`).toBe(true);
    if (section && button) {
      expect(button.x).toBeGreaterThanOrEqual(section.x - 1);
      expect(button.x + button.width).toBeLessThanOrEqual(section.x + section.width + 1);
    }
  }
});

test("inside an open part, next and previous walk the record parts", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeInProgress);
  await signIn(page, request, "audit");
  await openCase(page, "audit", rec.id);
  await openSection(page, "finding");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: new RegExp(T.common.prev) })).toHaveCount(0);
  await dialog.getByRole("button", { name: new RegExp(`^${T.common.next}:`) }).click();
  await expect(page.locator("#section-response button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${T.common.prev}:`) }).click();
  await expect(page.locator("#section-finding button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
});
