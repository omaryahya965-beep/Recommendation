import { expect, test } from "@playwright/test";

import { T } from "../../lib/i18n/ar";
import { apiGet, firstRecommendationOf } from "../support/api";
import { signIn } from "../support/auth";
import { FIXTURES, uniqueSuffix } from "../support/env";
import { expectNoHorizontalScroll } from "../support/layout";
import { caseUrl, expectStatus } from "../support/workspace";

/**
 * The phone app (Pixel 7): the shell, the case screen with its sheets, and
 * the register's filter sheet. Same API and forms as desktop.
 */

test("the employee home has role tabs, a badge and a More sheet", async ({ page, request }) => {
  await signIn(page, request, "employee");
  await page.goto("/employee/my-tasks");

  const tabs = page.getByTestId("mobile-bottom-nav");
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: new RegExp(T.mobile.tabs.home) })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("home-hero-compact")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await tabs.getByRole("button", { name: T.mobile.more }).click();
  const more = page.getByTestId("more-sheet");
  await expect(more.getByRole("dialog")).toBeVisible();
  await expect(more.getByRole("link", { name: T.nav.settings })).toBeVisible();
  await expect(more.getByRole("button", { name: T.nav.logout })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toHaveCount(0);
});

test("the employee works a step from its sheet and attaches evidence", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "employee", FIXTURES.financeInProgress);
  await signIn(page, request, "employee");
  await page.goto(caseUrl("employee", rec.id));

  await expect(page.getByTestId("mobile-status-hero")).toBeVisible();
  await expect(page.getByTestId("stage-chips").locator('[aria-current="step"]')).toContainText(
    T.workflow.stages.execution
  );
  // Detail pages trade the tab bar for a back button.
  await expect(page.getByTestId("mobile-bottom-nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: T.mobile.back })).toBeVisible();

  const before = (
    await apiGet<{ action_plan: { steps: Array<{ id: number; progress_percent: number; is_done: boolean }> } }>(
      request,
      "employee",
      `/api/recommendations/${rec.id}/`
    )
  ).body.action_plan.steps;
  const first = before.find((step) => !step.is_done)!;

  await page.getByRole("button", { name: T.mobile.openStep.replace("{n}", "1") }).click();
  const sheet = page.getByTestId("step-sheet");
  await expect(sheet.getByRole("dialog")).toBeVisible();
  await sheet.getByRole("button", { name: T.mobile.increase }).click();
  await expect
    .poll(async () => {
      const { body } = await apiGet<{ action_plan: { steps: Array<{ id: number; progress_percent: number }> } }>(
        request,
        "employee",
        `/api/recommendations/${rec.id}/`
      );
      return body.action_plan.steps.find((step) => step.id === first.id)?.progress_percent;
    })
    .toBe(Math.min(100, first.progress_percent + 10));
  await sheet.getByRole("dialog").getByRole("button", { name: T.nav.close }).click();

  // Evidence from the sticky bar.
  const evidenceCount = async () =>
    (await apiGet<{ evidence_files: unknown[] }>(request, "employee", `/api/recommendations/${rec.id}/`)).body
      .evidence_files.length;
  const filesBefore = await evidenceCount();
  await page.getByRole("button", { name: T.caseView.actions.upload_evidence }).click();
  const upload = page.getByTestId("evidence-sheet");
  await upload.locator('input[type="file"]').first().setInputFiles({
    name: `phone-${uniqueSuffix()}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 phone evidence"),
  });
  await upload.getByRole("button", { name: T.evidenceRegister.upload }).click();
  await expect.poll(evidenceCount).toBe(filesBefore + 1);
  await expect(upload).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("the head records the department's response from the action sheet", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "headEng", FIXTURES.engineeringPending);
  await signIn(page, request, "headEng");
  await page.goto(caseUrl("department_head", rec.id));

  await page.getByRole("button", { name: T.caseView.actions.respond }).click();
  const sheet = page.getByTestId("action-sheet");
  await expect(sheet.getByRole("dialog")).toBeVisible();
  await sheet.getByLabel(T.response.notes).fill("نوافق وسنعد خطة عمل.");

  // A half-filled form is not lost to a stray close.
  await sheet.getByRole("dialog").getByRole("button", { name: T.nav.close }).click();
  await expect(sheet.getByRole("alertdialog")).toContainText(T.mobile.discardChanges);
  // The question takes focus (on the safe answer); Escape means "keep editing".
  await expect(sheet.getByRole("button", { name: T.mobile.keepEditing })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet.getByRole("alertdialog")).toHaveCount(0);
  await expect(sheet.getByLabel(T.response.notes)).toHaveValue("نوافق وسنعد خطة عمل.");
  await sheet.getByRole("dialog").getByRole("button", { name: T.nav.close }).click();
  await sheet.getByRole("button", { name: T.mobile.keepEditing }).click();

  await sheet.getByRole("button", { name: T.response.submit }).click();
  await expectStatus(request, rec.id, "audit_review", "headEng");
  await expect(sheet).toHaveCount(0);
});

test("audit filters the register from a sheet", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/recommendations");
  await page.getByRole("button", { name: T.filters.title }).click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet.getByRole("dialog")).toBeVisible();
  await sheet.getByRole("combobox", { name: T.register.waitingColumn, exact: true }).selectOption("department");
  await expect(page).toHaveURL(/waiting_on=department/);
  // "Show N results" is worded by plural form, whatever N turns out to be.
  const showResults = new RegExp(Object.values(T.mobile.showResults).map((form) => form.replace("{n}", "\\d+")).join("|"));
  await sheet.getByRole("button", { name: showResults }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: T.register.chipWaitingOn.replace("{who}", T.workflow.waitingOn.department) })
  ).toBeVisible();
});

test("an English phone session lays out left-to-right", async ({ page, request }) => {
  await signIn(page, request, "employee");
  await page.evaluate(() => window.localStorage.setItem("audit_locale", "en"));
  await page.goto("/employee/my-tasks");
  await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.evaluate(() => window.localStorage.setItem("audit_locale", "ar"));
});

test.describe("narrow phones", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("key screens fit 320px without sideways scrolling", async ({ page, request }) => {
    const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeInProgress);
    await signIn(page, request, "audit");
    for (const path of ["/audit/dashboard", "/audit/recommendations", caseUrl("audit", rec.id)]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page);
    }
  });
});
