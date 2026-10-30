/**
 * Double submit and report transitions from the 2026-10-27 QA run:
 * BUG-02, BUG-09, BUG-10 (UI side), BUG-12.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiGet, apiPost } from "./support/api";
import { signIn } from "./support/auth";
import { uniqueSuffix } from "./support/env";

async function financeDepartmentId(request: APIRequestContext) {
  const { body } = await apiGet<{ results: { id: number; name: string }[] }>(request, "audit", "/api/departments/");
  return body.results[0].id;
}

async function draftReport(request: APIRequestContext, recs = 1) {
  const department = await financeDepartmentId(request);
  const title = `QA submit ${uniqueSuffix()}`;
  const { body: report } = await apiPost<{ id: number }>(request, "audit", "/api/reports/", {
    title, department, engagement_type: "assurance",
  });
  const ids: number[] = [];
  for (let i = 0; i < recs; i += 1) {
    const { body } = await apiPost<{ id: number }>(request, "audit", "/api/recommendations/", {
      report: report.id, text: `QA finding ${i} ${uniqueSuffix()}`, risk_level: "low",
    });
    ids.push(body.id);
  }
  return { id: report.id, title, recs: ids };
}

test("BUG-02: double-click Save on a new report creates one report", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/reports/new");
  const title = `QA dup ${uniqueSuffix()}`;
  await page.locator("main input").first().fill(title);
  await page.locator("main select").first().selectOption({ index: 1 });
  const posts: number[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/api/reports/") && r.request().method() === "POST") posts.push(r.status());
  });
  await page.locator("main button[type=submit]").dblclick();
  await expect(page.getByText(title).first()).toBeVisible();
  await page.waitForTimeout(800);
  expect(posts).toEqual([201]);
  const { body } = await apiGet<{ results: unknown[] }>(request, "audit", `/api/reports/?search=${encodeURIComponent(title)}`);
  expect(body.results).toHaveLength(1);
});

test("BUG-02: Enter pressed twice on a new report creates one report", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/reports/new");
  const title = `QA enter ${uniqueSuffix()}`;
  await page.locator("main input").first().fill(title);
  await page.locator("main select").first().selectOption({ index: 1 });
  await page.locator("main input").first().press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByText(title).first()).toBeVisible();
  await page.waitForTimeout(800);
  const { body } = await apiGet<{ results: unknown[] }>(request, "audit", `/api/reports/?search=${encodeURIComponent(title)}`);
  expect(body.results).toHaveLength(1);
});

test("BUG-02: double-click Save on a follow-up report archives one snapshot", async ({ page, request }) => {
  await signIn(page, request, "audit");
  await page.goto("/audit/followup-reports");
  const dates = page.locator("main input[type=date]");
  await dates.nth(0).fill("2025-01-01");
  await dates.nth(1).fill("2025-03-31");
  await page.locator("main button[type=submit]").click();
  const save = page.locator("main button[type=button]").filter({ hasText: /حفظ التقرير/ }).first();
  await expect(save).toBeEnabled();
  const { body: before } = await apiGet<{ count: number }>(request, "audit", "/api/followup-reports/");
  await save.dblclick();
  await expect(save).toBeDisabled();
  await page.waitForTimeout(800);
  const { body: after } = await apiGet<{ count: number }>(request, "audit", "/api/followup-reports/");
  expect(after.count).toBe(before.count + 1);
});

test("BUG-09/BUG-10: sending a report asks first; Esc cancels; confirm sends once", async ({ page, request }) => {
  const report = await draftReport(request, 2);
  await signIn(page, request, "audit");
  await page.goto(`/audit/reports/${report.id}`);
  const send = page.getByRole("button", { name: "إرسال التقرير إلى الدائرة" }).first();
  await send.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("توصيتان");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const { body: still } = await apiGet<{ status: string }>(request, "audit", `/api/reports/${report.id}/`);
  expect(still.status).toBe("draft");

  const posts: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/submit-to-department/")) posts.push(r.status());
  });
  await send.click();
  await dialog.getByRole("button", { name: "إرسال التقرير إلى الدائرة" }).dblclick();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(800);
  expect(posts).toEqual([200]);
  const { body: rec } = await apiGet<{ status: string; trail: { action: string }[] }>(
    request, "audit", `/api/recommendations/${report.recs[0]}/`
  );
  expect(rec.status).toBe("pending_response");
  expect(rec.trail.filter((t) => t.action === "report_submitted_to_department")).toHaveLength(1);
});

test("BUG-12: Submit to Council is disabled with the reason until every recommendation is approved", async ({ page, request }) => {
  const report = await draftReport(request, 2);
  await apiPost(request, "audit", `/api/reports/${report.id}/submit-to-department/`);
  for (const id of report.recs) await apiPost(request, "head", `/api/recommendations/${id}/respond/`, { decision: "agree" });
  await apiPost(request, "audit", `/api/recommendations/${report.recs[0]}/review/`, { accept: true });
  await signIn(page, request, "audit");
  await page.goto(`/audit/reports/${report.id}`);
  const submit = page.getByRole("button", { name: "رفع التقرير إلى المجلس للمصادقة" }).first();
  await expect(submit).toBeDisabled();
  await expect(page.locator("#council-not-ready").first()).toContainText("توصية واحدة");

  await apiPost(request, "audit", `/api/recommendations/${report.recs[1]}/review/`, { accept: true });
  await page.reload();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "رفع التقرير إلى المجلس للمصادقة" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  const { body } = await apiGet<{ status: string }>(request, "audit", `/api/reports/${report.id}/`);
  expect(body.status).toBe("pending_council");
});
