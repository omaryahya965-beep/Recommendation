/**
 * UI behaviour from the 2026-10-27 QA run (Stage 6):
 * BUG-03, BUG-19 and the rest of the interface items.
 */
import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet, apiPost } from "./support/api";
import { signIn } from "./support/auth";
import { uniqueSuffix } from "./support/env";
import { caseAfterPartialVerification } from "./support/qa";
import { openSection } from "./support/workspace";

async function draftReport(request: Parameters<typeof apiGet>[0]) {
  const { body: depts } = await apiGet<{ results: { id: number }[] }>(request, "audit", "/api/departments/");
  const { body } = await apiPost<{ id: number }>(request, "audit", "/api/reports/", {
    title: `QA ui ${uniqueSuffix()}`, department: depts.results[0].id, engagement_type: "assurance",
  });
  return body.id;
}

test("BUG-03: an in-app link asks before leaving a form with unsaved input", async ({ page, request }) => {
  const report = await draftReport(request);
  await signIn(page, request, "audit");
  await page.goto(`/audit/recommendations/new?report=${report}`);
  const box = page.locator("main textarea").first();
  await box.fill("QA unsaved finding text");
  const url = page.url();

  await page.locator("aside a[href='/audit/dashboard']").first().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "البقاء في الصفحة" }).click();
  await expect(dialog).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(box).toHaveValue("QA unsaved finding text");

  await page.locator("aside a[href='/audit/dashboard']").first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "مغادرة دون حفظ" }).click();
  await expect(page).toHaveURL(/\/audit\/dashboard/);

  // Nothing typed: links leave at once.
  await page.goto(`/audit/recommendations/new?report=${report}`);
  await page.locator("main textarea").first().waitFor();
  await page.locator("aside a[href='/audit/dashboard']").first().click();
  await expect(page).toHaveURL(/\/audit\/dashboard/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("BUG-19: the register search finds a case by REC-0042, REC-42 and 42", async ({ page, request }) => {
  // A case the employee register lists (it shows work in progress only).
  const { body } = await apiGet<{ results: { id: number }[] }>(
    request, "employee", "/api/recommendations/?status__in=in_progress,partial,returned_insufficient,reopened&ordering=-id&page_size=1"
  );
  const id = body.results[0].id;
  await signIn(page, request, "employee");
  for (const term of [`REC-${String(id).padStart(4, "0")}`, `REC-${id}`, String(id)]) {
    await page.goto(`/employee/recommendations?search=${encodeURIComponent(term)}`);
    await expect(page.locator(`main a[href^="/employee/my-tasks/${id}"]:visible, main a[href^="/employee/recommendations/${id}"]:visible`).first(), term).toBeVisible();
  }
});

test("BUG-26: evidence details open from the keyboard and announce their state", async ({ page, request }) => {
  const id = await caseAfterPartialVerification(request);
  await signIn(page, request, "audit");
  await page.goto(`/audit/recommendations/${id}`);
  await openSection(page, "evidence");
  const row = page.getByTestId("evidence-item").filter({ visible: true }).first();
  const toggle = row.locator("button[aria-expanded]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const details = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
  await expect(details).toBeVisible();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(details).toHaveCount(0);
});

test("BUG-08: Forgot password explains what to do, in both languages, without an error", async ({ page }) => {
  for (const [locale, name, help] of [
    ["ar", "نسيت كلمة المرور", "يعيد مسؤول النظام تعيين كلمات المرور"],
    ["en", "Forgot password", "Passwords are reset by the system administrator"],
  ] as const) {
    await page.goto("/login");
    await page.evaluate((l) => localStorage.setItem("audit_locale", l), locale);
    await page.reload();
    const toggle = page.getByRole("button", { name });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("status").filter({ hasText: help })).toBeVisible();
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
    await toggle.click();
    await expect(page.getByText(help)).toHaveCount(0);
  }
});

test("BUG-20: two filters changed back to back are both kept", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/recommendations");
  await page.getByRole("button", { name: T.filters.title }).first().click();
  const stage = page.getByLabel(T.register.stage).filter({ visible: true }).first();
  const risk = page.getByLabel(T.common.risk).filter({ visible: true }).first();
  await expect(stage).toBeVisible();
  const stageValue = await stage.locator("option").nth(1).getAttribute("value");
  // Both changes inside one task: the second fires before the URL updates.
  await page.evaluate(([s, r, v]) => {
    const [stageEl, riskEl] = [s, r].map((label) =>
      [...document.querySelectorAll("label")].find((el) => el.textContent?.startsWith(label) && el.offsetParent)!.querySelector("select")!
    );
    stageEl.value = v;
    stageEl.dispatchEvent(new Event("change", { bubbles: true }));
    riskEl.value = "high";
    riskEl.dispatchEvent(new Event("change", { bubbles: true }));
  }, [T.register.stage, T.common.risk, stageValue!] as const);
  await expect(page).toHaveURL(new RegExp(`stage=${stageValue}`));
  await expect(page).toHaveURL(/risk_level=high/);
  await expect(stage).toHaveValue(stageValue!);
  await expect(risk).toHaveValue("high");
});

test("BUG-21: header search works from the keyboard and links to every match", async ({ page, request }) => {
  // Nine cases sharing one word: more than the 8 the dropdown shows.
  const word = `QAsearch${uniqueSuffix().replace(/\W/g, "")}`;
  const report = await draftReport(request);
  for (let n = 0; n < 9; n += 1) {
    await apiPost(request, "audit", "/api/recommendations/", { report, text: `${word} case ${n}`, risk_level: "low" });
  }
  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  const box = page.getByRole("combobox", { name: T.nav.search });
  await box.fill(word);
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option").first()).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(8);
  const seeAll = page.getByRole("link", { name: /عرض كل النتائج \(\d+\)/ });
  await expect(seeAll).toBeVisible();

  await box.press("ArrowDown");
  await box.press("ArrowDown");
  const second = list.getByRole("option").nth(1);
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(box).toHaveAttribute("aria-activedescendant", (await second.getAttribute("id"))!);
  const href = await second.locator("a").getAttribute("href");
  await box.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  await box.fill(word);
  await expect(list.getByRole("option").first()).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/audit/recommendations\\?search=${word}$`));
  await expect(page.locator("main").getByText(/\d+/).first()).toBeVisible();

  const { body } = await apiGet<{ results: { id: number }[] }>(request, "audit", "/api/recommendations/?page_size=1");
  const id = body.results[0].id;
  await box.fill(`REC-${id}`);
  await box.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/audit/recommendations/${id}$`));
});

test("BUG-22: a register page past the end shows the last page, not an error", async ({ page, request }) => {
  const { body } = await apiGet<{ count: number }>(request, "audit", "/api/recommendations/?page_size=1");
  const last = Math.max(1, Math.ceil(body.count / 25));
  await signIn(page, request, "audit");
  for (const [asked, expected] of [["999", last], ["-1", 1], ["abc", 1]] as const) {
    await page.goto(`/audit/recommendations?page=${asked}`);
    await expect(page, asked).toHaveURL(new RegExp(`page=${expected}(&|$)`));
    await expect(page.locator("main").getByText(T.common.error)).toHaveCount(0);
    await expect(page.locator("main a[href^='/audit/recommendations/']:visible").first()).toBeVisible();
  }
});

for (const [who, path] of [["audit", "/audit/analytics"], ["head", "/department/analytics"]] as const) {
  test(`BUG-23: ${who}: every aging, stage and recurrence link lists what its figure counts`, async ({ page, request }) => {
    const { body: data } = await apiGet<{
      overdue_aging: Record<string, number>;
      by_stage: Record<string, number>;
      recurrence: { confirmed: number };
    }>(request, who, "/api/analytics/");
    await signIn(page, request, who);
    await page.goto(path);
    await expect(page.locator("main a[href*='overdue_age=']").first()).toBeAttached();
    const hrefs = await page.locator("main a[href*='overdue_age='], main a[href*='stage='], main a[href*='recurrence_confirmed=true']")
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) {
      const params = new URLSearchParams(href.split("?")[1]);
      const expected = params.has("overdue_age")
        ? data.overdue_aging[params.get("overdue_age")!] ?? 0
        : params.has("stage")
          ? data.by_stage[params.get("stage")!] ?? 0
          : data.recurrence.confirmed;
      const { body } = await apiGet<{ count: number }>(request, who, `/api/recommendations/?${params}`);
      expect(body.count, href).toBe(expected);
    }
  });
}

test("BUG-24: the definition button explains a linked tile without leaving the page", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/analytics");
  const tile = page.getByTestId("analytics-overdue");
  await expect(tile).toBeVisible();
  // No button nested in a link anywhere on the page.
  await expect(page.locator("main a button, main a [role=button]")).toHaveCount(0);
  const url = page.url();
  const hint = tile.getByRole("button", { name: T.insights.howCalculated });
  await hint.click();
  await expect(tile.getByRole("tooltip")).toBeVisible();
  expect(page.url()).toBe(url);
  await page.mouse.move(0, 0);
  await hint.blur();
  await expect(tile.getByRole("tooltip")).toBeHidden();
  // The rest of the tile still opens the list.
  const box = (await tile.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
  await expect(page).toHaveURL(/\/audit\/recommendations\?overdue=1/);
});

test("BUG-25: editing a draft that does not exist says so instead of offering a retry", async ({ page, request }) => {
  await signIn(page, request, "audit");
  for (const id of ["99999", "abc", "-3"]) {
    await page.goto(`/audit/recommendations/${id}/edit`);
    await expect(page.locator("main").getByText(T.caseView.unavailableTitle), id).toBeVisible();
    await expect(page.locator("main").getByText(T.common.error)).toHaveCount(0);
    await expect(page.locator("main").getByRole("link", { name: T.nav.recommendations })).toBeVisible();
  }
});
