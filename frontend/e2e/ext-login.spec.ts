/** External QA: sign-in messages follow a language switch made after they appear. */
import { expect, test } from "@playwright/test";

import { T as AR } from "../lib/i18n/ar";
import { T as EN } from "../lib/i18n/en";

test("the sign-in error and field errors re-render in the new language", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("audit_locale", "ar"));
  await page.reload();

  // Field errors first (empty form).
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText(AR.login.errorUsername)).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText(EN.login.errorUsername)).toBeVisible();
  await expect(page.getByText(AR.login.errorUsername)).toHaveCount(0);

  // Wrong credentials, then back to Arabic.
  await page.locator("input[name=username], input[autocomplete=username]").first().fill("nobody");
  await page.locator("input[type=password]").first().fill("wrong-password");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText(EN.login.error)).toBeVisible();
  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page.getByText(AR.login.error)).toBeVisible();
  await expect(page.getByText(EN.login.error)).toHaveCount(0);
});
