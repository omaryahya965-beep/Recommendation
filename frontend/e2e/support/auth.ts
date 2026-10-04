import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { T } from "../../lib/i18n/ar";
import { apiLogin } from "./api";
import { PASSWORD, ROLE_HOME, USERS, type UserKey } from "./env";

const AUTH_STORAGE_KEY = "audit_tracker_auth";

/** Signs in through the real login form. */
export async function loginViaUI(page: Page, who: UserKey, password = PASSWORD) {
  await page.goto("/login");
  await page.locator("#login-username").fill(USERS[who]);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: T.login.submit }).click();
}

/**
 * Fast sign-in for specs that are not about the login screen: obtains tokens
 * from the API and stores them exactly where the app keeps its session, then
 * opens the role's home page.
 */
export async function signIn(page: Page, request: APIRequestContext, who: UserKey) {
  const session = await apiLogin(request, who);
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      AUTH_STORAGE_KEY,
      JSON.stringify({ access: session.access, refresh: session.refresh, user: session.user }),
    ] as const
  );
  return session;
}

export async function expectRoleHome(page: Page, role: string) {
  await expect(page).toHaveURL(ROLE_HOME[role]);
}
