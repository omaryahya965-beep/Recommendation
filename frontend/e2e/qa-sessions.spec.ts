/**
 * Session regressions from the 2026-10-27 QA run: S2, BUG-04, BUG-05,
 * BUG-06, BUG-07.
 */
import { expect, test } from "@playwright/test";

import { apiLogin } from "./support/api";
import { signIn } from "./support/auth";
import { API_URL } from "./support/env";

const STORAGE_KEY = "audit_tracker_auth";

async function freshSession(request: Parameters<typeof apiLogin>[0], username: string) {
  const res = await request.post(`${API_URL}/api/auth/login/`, { data: { username, password: "E2e@12345" } });
  expect(res.status()).toBe(200);
  return res.json();
}

test("S2: an expired access token is renewed once for all parallel requests", async ({ page, request }) => {
  const s = await freshSession(request, "head_finance");
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify({ access: `${s.access.slice(0, -4)}AAAA`, refresh: s.refresh, user: s.user })] as const
  );
  const refreshes: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/auth/refresh/")) refreshes.push(r.status());
  });
  await page.goto("/department/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/department\/dashboard/);
  expect(refreshes).toEqual([200]);
});

test("BUG-05: a throttled refresh keeps the session and says so", async ({ page, request }) => {
  const s = await freshSession(request, "head_finance");
  // The backend no longer shares the login bucket (apps.accounts.test_sessions);
  // here the server answers 429 anyway, as it would under real overload.
  let refreshCalls = 0;
  await page.route("**/api/auth/refresh/", (route) => {
    refreshCalls += 1;
    return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "throttled" }) });
  });
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify({ access: `${s.access.slice(0, -4)}AAAA`, refresh: s.refresh, user: s.user })] as const
  );
  await page.goto("/department/dashboard");
  await expect(page.getByText(/تعذّر تجديد الجلسة الآن/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/department\/dashboard/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();
  expect(refreshCalls).toBeGreaterThan(1);
});

for (const value of ["{}", JSON.stringify({ access: "a", refresh: "r", user: null })]) {
  test(`BUG-07: a malformed saved session (${value.slice(0, 20)}) leads to the login page`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/login");
    await page.evaluate(([key, v]) => localStorage.setItem(key, v), [STORAGE_KEY, value] as const);
    for (const path of ["/", "/audit/dashboard"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator("#login-username")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("BUG-04: a signed-out visit asks the API nothing before redirecting", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.push(r.url());
  });
  await page.goto("/audit/dashboard");
  await expect(page).toHaveURL(/\/login/);
  expect(calls.filter((u) => u.includes("nav-counts"))).toEqual([]);
});

for (const [label, width, collapsed] of [["tablet 900 px", 900, false], ["collapsed desktop", 1440, true]] as const) {
  test(`BUG-06: sign-out is reachable on the ${label}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, request, "employee");
    if (collapsed) await page.evaluate(() => localStorage.setItem("audit_sidebar_collapsed", "1"));
    await page.goto("/employee/my-tasks");
    const signOut = page.locator("aside").getByRole("button", { name: /تسجيل الخروج/ });
    await expect(signOut).toBeVisible();
    await signOut.click();
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  });
}
