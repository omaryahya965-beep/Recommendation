import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet } from "./support/api";
import { signIn } from "./support/auth";
import { API_URL } from "./support/env";

/**
 * The reminder engine through its real entry point (the cron endpoint, with
 * the E2E-only secret). Catch-up and idempotency are covered in depth by the
 * backend tests; this checks the deployed path end to end.
 */
test("the daily run reminds the overdue employee once and reports its health", async ({ page, request }) => {
  const run = () =>
    request.get(`${API_URL}/api/internal/send-reminders/`, {
      headers: { Authorization: "Bearer e2e-cron-secret" },
    });

  const first = await run();
  expect(first.status()).toBe(200);
  expect((await first.json()).created).toBeGreaterThan(0);

  const second = await run();
  expect((await second.json()).created).toBe(0);

  const { body } = await apiGet<{ results: Array<{ type: string; message: string }> }>(
    request,
    "employee2",
    "/api/notifications/?page_size=50"
  );
  expect(body.results.some((item) => item.type === "overdue")).toBe(true);

  await signIn(page, request, "audit");
  await page.goto("/audit/settings/reminders");
  const status = page.getByTestId("reminder-engine-status");
  await expect(status).toBeVisible();
  await expect(status.getByText(T.reminders.engineCatchUp)).toBeVisible();
});
