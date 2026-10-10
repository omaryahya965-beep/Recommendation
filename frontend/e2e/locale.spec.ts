import { expect, test } from "@playwright/test";

import { T as EN } from "../lib/i18n/en";
import { firstRecommendationOf } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES } from "./support/env";
import { caseUrl } from "./support/workspace";

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

/**
 * The server renders Arabic; an English session must still hydrate cleanly.
 * A text mismatch makes React throw the server HTML away and client-render
 * the document, which also drops <html data-theme> (dark mode was lost).
 * Covers a static page and a server-rendered case page, whose sidebar
 * hydrates late inside a Suspense boundary.
 */
test("an English dark-mode session hydrates without errors and keeps its theme", async ({ page, request }) => {
  const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeInProgress);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|#418|#423|#425/i.test(message.text())) errors.push(message.text());
  });

  await signIn(page, request, "audit");
  await page.evaluate(() => {
    window.localStorage.setItem("audit_locale", "en");
    window.localStorage.setItem("audit_theme", "dark");
  });

  for (const path of ["/audit/dashboard", caseUrl("audit", rec.id)]) {
    await page.goto(path);
    await expect(page.getByRole("navigation").getByRole("link", { name: EN.nav.recommendations }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  expect(errors, "hydration errors").toEqual([]);
});
