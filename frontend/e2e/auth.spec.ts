import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { expectRoleHome, loginViaUI } from "./support/auth";
import type { UserKey } from "./support/env";

const ROLES: Array<[UserKey, string]> = [
  ["audit", "audit"],
  ["head", "department_head"],
  ["employee", "employee"],
  ["council", "council"],
];

test.describe("sign-in", () => {
  for (const [who, role] of ROLES) {
    test(`${role} signs in and lands on the role home`, async ({ page }) => {
      await loginViaUI(page, who);
      await expectRoleHome(page, role);
    });
  }

  test("a wrong password is rejected with the credentials message", async ({ page }) => {
    await loginViaUI(page, "audit", "not-the-password");
    await expect(page.getByText(T.login.error).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a signed-in user opening another role's area is sent home", async ({ page }) => {
    await loginViaUI(page, "employee");
    await expectRoleHome(page, "employee");
    await page.goto("/audit/dashboard");
    await expectRoleHome(page, "employee");
  });
});
