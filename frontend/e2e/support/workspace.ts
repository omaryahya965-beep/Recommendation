import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { apiGet } from "./api";
import type { UserKey } from "./env";

/**
 * Page-object helpers for a recommendation case. Specs describe WHAT happens
 * ("audit accepts the response"); how the current UI does it lives here, so a
 * redesign updates these helpers rather than every spec.
 */
export type RoleKey = "audit" | "department_head" | "employee" | "council";

export function caseUrl(role: RoleKey, id: number): string {
  switch (role) {
    case "audit":
      return `/audit/recommendations/${id}`;
    case "department_head":
      return `/department/recommendations/${id}`;
    case "employee":
      return `/employee/my-tasks/${id}`;
    case "council":
      return `/council/recommendations/${id}`;
  }
}

export async function openCase(page: Page, role: RoleKey, id: number) {
  await page.goto(caseUrl(role, id));
  // References render zero-padded (REC-0006).
  await expect(page.getByText(new RegExp(`REC-0*${id}(?!\\d)`)).first()).toBeVisible();
}

export type SectionId = "finding" | "response" | "plan" | "evidence" | "verification" | "decisions" | "history";

/** Expands one record section of the case (no-op when already open). */
export async function openSection(page: Page, id: SectionId) {
  const toggle = page.locator(`#section-${id} button[aria-expanded]`).first();
  // Each part opens as a panel over the page; close another one first.
  if ((await toggle.getAttribute("aria-expanded")) !== "true" && (await page.getByRole("dialog").count())) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** The form for the user's current action, inside the action card. */
export function actionPanel(page: Page) {
  return page.locator("#case-action-panel");
}

/** Clicks a decision button in the action card, then confirms it in the dialog. */
export async function decide(page: Page, label: string, notes?: string, notesLabel?: string) {
  const panel = actionPanel(page);
  if (notes) {
    const field = notesLabel ? panel.getByLabel(notesLabel).first() : panel.locator("textarea").last();
    await field.fill(notes);
  }
  await panel.getByRole("button", { name: label, exact: true }).first().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function recommendationStatus(
  request: APIRequestContext,
  who: UserKey,
  id: number
): Promise<string> {
  const { body } = await apiGet<{ status: string }>(request, who, `/api/recommendations/${id}/`);
  return body.status;
}

export async function expectStatus(
  request: APIRequestContext,
  id: number,
  status: string,
  who: UserKey = "audit"
) {
  await expect
    .poll(() => recommendationStatus(request, who, id), { timeout: 20_000 })
    .toBe(status);
}

export function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  // The local calendar date (the server uses Asia/Gaza, as does the suite).
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
