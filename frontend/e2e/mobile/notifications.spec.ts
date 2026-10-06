import { expect, test } from "@playwright/test";

import { T } from "../../lib/i18n/ar";
import { apiGet } from "../support/api";
import { signIn } from "../support/auth";
import { expectNoHorizontalScroll } from "../support/layout";

/**
 * The phone notification panel and the audit home's queues (Pixel 7).
 *
 * Regression: the panel used to render inside the app bar, whose backdrop
 * blur made it the containing block of the panel's `position: fixed`; the
 * "full-screen" panel was squeezed into the 56px bar and the bottom tabs
 * were drawn over it.
 */

test("the notification panel covers the screen above the app bars and locks the page", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  const bell = page.locator("[data-testid=notification-bell]:visible");
  await bell.click();

  const panel = page.getByTestId("notification-panel");
  await expect(panel).toBeVisible();
  // Measured once its entrance animation has finished.
  await panel.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  const viewport = page.viewportSize()!;
  const box = (await panel.boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(1);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(viewport.width - 1);

  const facts = await page.evaluate(() => {
    const node = document.querySelector("[data-testid=notification-panel]")!;
    const atBottom = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 20);
    const atTop = document.elementFromPoint(window.innerWidth / 2, 30);
    return {
      inBody: node.parentElement === document.body,
      bottomInPanel: Boolean(atBottom && node.contains(atBottom)),
      topInPanel: Boolean(atTop && node.contains(atTop)),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  expect(facts).toEqual({ inBody: true, bottomInPanel: true, topInPanel: true, bodyOverflow: "hidden" });
  // "View all" sits above the home indicator, not under the bottom tabs.
  await expect(panel.getByTestId("notification-view-all")).toBeInViewport();

  await panel.getByRole("button", { name: T.nav.close }).click();
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");

  // "View all" opens the inbox.
  await bell.click();
  await page.getByTestId("notification-view-all").click();
  await expect(page).toHaveURL(/\/audit\/notifications$/);
  await expect(page.getByTestId("notification-center")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a tapped notification opens its target and the panel closes", async ({ page, request }) => {
  const { body } = await apiGet<{ results: Array<{ id: number; recommendation: number | null }> }>(
    request,
    "audit",
    "/api/notifications/?page_size=100"
  );
  const note = body.results.find((item) => item.recommendation !== null);
  test.skip(!note, "no case notification for audit in this run");

  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  await page.locator("[data-testid=notification-bell]:visible").click();
  const item = page.locator(`[data-testid=notification-panel] [data-testid=notification-item][data-id="${note!.id}"]`);
  await item.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/audit/recommendations/${note!.recommendation}(\\?section=\\w+)?$`));
  await expect(page.getByTestId("notification-panel")).toHaveCount(0);
  await expect(page.getByTestId("mobile-case")).toBeVisible();
});

test("the audit home on a phone: summary, newest-first queue and view-more", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  await expect(page.getByTestId("home-hero-compact")).toBeVisible();
  await expect(page.getByTestId("home-summary")).toBeVisible();
  const priorities = page.getByTestId("audit-priorities");
  await expect(priorities).toBeVisible();
  await expectNoHorizontalScroll(page);

  await priorities.getByTestId("priorities-more").or(priorities.getByText(T.queues.emptyAll)).first().waitFor();
  if (await priorities.getByTestId("priorities-more").count()) {
    await priorities.getByTestId("priorities-more").click();
    await expect(page).toHaveURL(/queue=audit_priorities/);
    // Phones hide the page title (the app bar has it); the crumb names the queue.
    await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText(T.queues.audit_priorities);
    await expectNoHorizontalScroll(page);
  }
});
