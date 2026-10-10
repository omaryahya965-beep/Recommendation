import { expect, test } from "@playwright/test";

import { T } from "../../lib/i18n/ar";
import { firstRecommendationOf } from "../support/api";
import { signIn } from "../support/auth";
import { FIXTURES, type UserKey } from "../support/env";
import { expectNoHorizontalScroll } from "../support/layout";
import { caseUrl, expectStatus } from "../support/workspace";

/** Every role's phone home: the app shell, the role's tabs, nothing wider than the screen. */
const HOMES: Array<{ who: UserKey; path: string; firstTab: string }> = [
  { who: "audit", path: "/audit/dashboard", firstTab: T.mobile.tabs.home },
  { who: "head", path: "/department/dashboard", firstTab: T.mobile.tabs.home },
  { who: "employee", path: "/employee/my-tasks", firstTab: T.mobile.tabs.home },
  { who: "council", path: "/council/pending-approvals", firstTab: T.mobile.tabs.approvals },
];

for (const home of HOMES) {
  test(`${home.who}: the phone home has the role's tabs`, async ({ page, request }) => {
    await signIn(page, request, home.who);
    await page.goto(home.path);
    const tabs = page.getByTestId("mobile-bottom-nav");
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("link").first()).toContainText(home.firstTab);
    await expect(tabs.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByTestId("mobile-app-bar")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test("the council approves a closure from the action sheet", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "council", FIXTURES.financeAwaitingClosure);
  await signIn(page, request, "council");
  await page.goto(caseUrl("council", rec.id));

  await page.getByRole("button", { name: T.caseView.actions.council_closure }).click();
  const sheet = page.getByTestId("action-sheet");
  await expect(sheet.getByRole("dialog")).toBeVisible();
  // The latest verification decision is shown with the decision form.
  await expect(sheet).toContainText(T.caseView.latestDecision);
  await sheet.getByLabel(T.verify.councilNotes).fill("يوافق المجلس على الإغلاق.");
  await sheet.getByRole("button", { name: T.verify.councilClose, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: T.verify.councilClose, exact: true }).click();

  await expectStatus(request, rec.id, "closed", "council");
  await expect(page.getByTestId("mobile-status-hero")).toContainText(T.workflow.noAction);
});
