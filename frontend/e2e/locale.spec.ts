import { expect, test } from "@playwright/test";

import { T as EN } from "../lib/i18n/en";
import { signIn } from "./support/auth";

/**
 * The saved language decides the document direction after hydration too.
 * (React re-applies <html lang="ar" dir="rtl"> when it hydrates the root;
 * the locale bridge has to win.)
 */
test("an English session stays left-to-right after the app hydrates", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.evaluate(() => window.localStorage.setItem("audit_locale", "en"));
  await page.goto("/audit/dashboard");
  await expect(page.getByRole("heading", { name: EN.dashboard.auditTitle })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.evaluate(() => window.localStorage.setItem("audit_locale", "ar"));
  await page.goto("/audit/dashboard");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
