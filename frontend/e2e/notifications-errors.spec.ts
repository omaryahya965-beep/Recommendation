import { expect, test, type Page } from "@playwright/test";

import { T as AR } from "../lib/i18n/ar";
import { T as EN } from "../lib/i18n/en";
import { signIn } from "./support/auth";
import type { UserKey } from "./support/env";

/**
 * Production regression (hotfix/prod-errors): the notification list returned
 * 500 while unread-count, nav-counts and the dashboard still worked. A failing
 * notification list must say what failed and why, offer Retry, and leave the
 * rest of the page working, in both languages and for every role.
 */
const ROLES: { who: UserKey; home: string; center: string }[] = [
  { who: "audit", home: "/audit/dashboard", center: "/audit/notifications" },
  { who: "head", home: "/department/dashboard", center: "/department/notifications" },
  { who: "employee", home: "/employee/my-tasks", center: "/employee/notifications" },
  { who: "council", home: "/council/pending-approvals", center: "/council/notifications" },
];

const isNotificationList = (url: URL) => url.pathname.endsWith("/api/notifications/");

async function failNotificationList(page: Page) {
  await page.route(isNotificationList, (route) =>
    route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Server Error (500)</h1>" })
  );
}

for (const locale of ["ar", "en"] as const) {
  const T = locale === "ar" ? AR : EN;
  const reason = T.apiErrors.genericStatus.replace("{status}", "500");

  for (const { who, home, center } of ROLES) {
    test(`notification list 500 is contained and explained — ${who} (${locale})`, async ({ page, request }) => {
      await signIn(page, request, who);
      await page.evaluate((value) => window.localStorage.setItem("audit_locale", value), locale);
      await failNotificationList(page);

      // Home: the page renders; only the activity card reports the failure.
      await page.goto(home);
      const activity = page.getByTestId("recent-activity-error");
      await expect(activity).toContainText(T.notify.loadError);
      await expect(activity).toContainText(reason);
      await expect(activity.getByRole("button", { name: T.common.retry })).toBeVisible();
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByText(T.common.error, { exact: true })).toHaveCount(0);

      // Bell: the panel explains the failure and offers Retry.
      await page.getByRole("button", { name: new RegExp(`^${T.nav.notifications}`) }).first().click();
      const panel = page.locator('[aria-labelledby="notify-panel-title"]');
      await expect(panel).toContainText(T.notify.loadError);
      await expect(panel).toContainText(reason);
      await expect(panel.getByRole("button", { name: T.common.retry })).toBeVisible();
      await page.keyboard.press("Escape");

      // Notifications page: translated reason + Retry, and Retry recovers.
      await page.goto(center);
      const banner = page.getByTestId("notification-center").getByRole("alert");
      await expect(banner).toContainText(T.notify.loadError);
      await expect(banner).toContainText(reason);
      await expect(page.getByText(T.common.error, { exact: true })).toHaveCount(0);

      await page.unroute(isNotificationList);
      await banner.getByRole("button", { name: T.common.retry }).click();
      await expect(banner).toHaveCount(0);
      await expect(page.getByTestId("notification-center")).toBeVisible();
    });
  }
}
