/**
 * Audit-trail integrity and validation from the 2026-10-27 QA run:
 * BUG-28, BUG-13, BUG-01, BUG-29.
 */
import { expect, test } from "@playwright/test";

import { apiGet, apiPost } from "./support/api";
import { signIn } from "./support/auth";
import { uniqueSuffix } from "./support/env";
import { caseAfterPartialVerification, caseInPlanStage, isoFromToday } from "./support/qa";

test("BUG-28: a file Internal Audit assessed has no delete control and the API refuses", async ({ page, request }) => {
  const id = await caseAfterPartialVerification(request);
  const { body } = await apiGet<{ evidence_files: { id: number; can_delete: boolean }[] }>(request, "employee", `/api/recommendations/${id}/`);
  expect(body.evidence_files[0].can_delete).toBe(false);
  const res = await apiPost<{ code: string }>(request, "employee", `/api/recommendations/${id}/evidence/${body.evidence_files[0].id}/delete/`);
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("evidence_assessed");
  await signIn(page, request, "employee");
  await page.goto(`/employee/my-tasks/${id}?section=evidence`);
  // A linked section opens as a panel over the page.
  await expect(page.getByRole("dialog").locator("tr[data-testid=evidence-item]").filter({ hasText: "assessed" })).toBeVisible();
  await expect(page.getByRole("button", { name: /حذف الملف/ })).toHaveCount(0);
});

test("BUG-13: plan target date input starts today; a past date is refused with a translated message", async ({ page, request }) => {
  const id = await caseInPlanStage(request);
  await signIn(page, request, "head");
  await page.goto(`/department/recommendations/${id}`);
  const date = page.locator("main input[type=date]").first();
  await expect(date).toHaveAttribute("min", isoFromToday(0));
  const { body: emps } = await apiGet<{ results: { id: number }[] }>(request, "head", "/api/employees/");
  const res = await apiPost<{ code: string }>(request, "head", `/api/recommendations/${id}/action-plan/`, {
    responsible_employee: emps.results[0].id, target_date: "2001-01-01", steps: [{ title: "x" }],
  });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("target_date_in_past");
});

test("BUG-13: report response deadline input is bounded and the server refuses a past date", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/reports/new");
  const date = page.locator("main input[type=date]");
  await expect(date).toHaveAttribute("min", isoFromToday(0));
  await page.locator("main input").first().fill(`QA deadline ${uniqueSuffix()}`);
  await page.locator("main select").first().selectOption({ index: 1 });
  // Bypass the input's min the way a hand-crafted request would.
  await date.evaluate((el: HTMLInputElement) => el.removeAttribute("min"));
  await date.fill("2001-01-01");
  await page.locator("main button[type=submit]").click();
  await expect(page.locator("main [role=alert]").first()).toContainText("لا يمكن أن يكون التاريخ في الماضي");
});

test("BUG-01: the reminder form refuses 3,000,000 days", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/settings?tab=reminders");
  const before = (await apiGet<{ results: unknown[] }>(request, "audit", "/api/reminder-rules/")).body.results.length;
  await page.getByRole("radio", { name: /بعد الموعد/ }).check();
  const days = page.locator("main input[type=number]");
  await expect(days).toHaveAttribute("max", "365");
  await days.fill("3000000");
  await page.locator("main form button[type=submit]").click();
  await page.waitForTimeout(600);
  const after = (await apiGet<{ results: unknown[] }>(request, "audit", "/api/reminder-rules/")).body.results.length;
  expect(after).toBe(before);
});

test("BUG-29: long text is bounded, counted and collapsed", async ({ page, request }) => {
  const tooLong = await apiPost<{ field_codes: Record<string, string[]> }>(request, "audit", "/api/recommendations/", {
    report: 0, text: "ن".repeat(20001), risk_level: "low",
  });
  expect(tooLong.status).toBe(400);
  const id = await caseInPlanStage(request, `QA long ${uniqueSuffix()}\n${"ن".repeat(19000)}`);
  await signIn(page, request, "audit");
  const t0 = Date.now();
  await page.goto(`/audit/recommendations/${id}?section=finding`);
  const showAll = page.getByRole("button", { name: /عرض النص كاملاً/ }).first();
  await expect(showAll).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(15_000);
  await showAll.click();
  await expect(page.getByRole("button", { name: "عرض أقل" }).first()).toBeVisible();

  await page.goto(`/department/recommendations/${id}`);
});

test("BUG-29: note fields show a counter against the limit", async ({ page, request }) => {
  const id = await caseInPlanStage(request);
  await signIn(page, request, "head");
  await page.goto(`/department/recommendations/${id}`);
  const notes = page.locator("main textarea").first();
  await expect(notes).toHaveAttribute("maxlength", "5000");
  await notes.fill("abc");
  await expect(page.getByText("3 / 5,000").first()).toBeVisible();
});
