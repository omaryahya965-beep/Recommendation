/**
 * Reasons and communication from the 2026-10-27 QA run:
 * BUG-15, BUG-16, BUG-18, BUG-11.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiGet, apiPost } from "./support/api";
import { signIn } from "./support/auth";
import { caseAfterPartialVerification } from "./support/qa";

async function resubmit(request: APIRequestContext, id: number) {
  expect((await apiPost(request, "employee", `/api/recommendations/${id}/mark-implemented/`)).status).toBe(200);
}

test("BUG-15: the employee sees why the department head returned the work", async ({ page, request }) => {
  const id = await caseAfterPartialVerification(request);
  await resubmit(request, id);
  await apiPost(request, "head", `/api/recommendations/${id}/review-implementation/`, {
    accept: false, notes: "أرفق كشف التسوية الموقّع",
  });
  await signIn(page, request, "employee");
  await page.goto(`/employee/my-tasks/${id}`);
  const callout = page.locator("main").getByText("ما طلبه رئيس الدائرة").first();
  await expect(callout).toBeVisible();
  await expect(page.locator("main").getByText("أرفق كشف التسوية الموقّع").first()).toBeVisible();
});

test("BUG-15: after Sufficient and a council reopen, only the council's reason is shown", async ({ page, request }) => {
  const id = await caseAfterPartialVerification(request);
  await resubmit(request, id);
  await apiPost(request, "head", `/api/recommendations/${id}/review-implementation/`, { accept: true });
  await apiPost(request, "audit", `/api/recommendations/${id}/verify/`, { decision: "sufficient", notes: "ok" });
  await apiPost(request, "audit", `/api/recommendations/${id}/submit-for-closure/`, { notes: "package" });
  const reopen = await apiPost(request, "council", `/api/recommendations/${id}/council-closure/`, {
    accept: false, notes: "يجب أن تشمل التسوية الربع الرابع",
  });
  expect(reopen.status).toBe(200);
  for (const [who, path] of [["employee", `/employee/my-tasks/${id}`], ["head", `/department/recommendations/${id}`]] as const) {
    await signIn(page, request, who);
    await page.goto(path);
    await expect(page.locator("main").getByText("سبب إعادة المجلس فتح التوصية").first()).toBeVisible();
    await expect(page.locator("main").getByText("يجب أن تشمل التسوية الربع الرابع").first()).toBeVisible();
    await expect(page.locator("main").getByText("ما طلبته الرقابة الداخلية")).toHaveCount(0);
  }
});

test("BUG-16: notifications follow the reader's language", async ({ page, request }) => {
  const id = await caseAfterPartialVerification(request);
  await resubmit(request, id);
  await apiPost(request, "head", `/api/recommendations/${id}/review-implementation/`, { accept: false, notes: "QA reason" });
  await signIn(page, request, "employee");
  await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
  await page.goto("/employee/notifications");
  await expect(page.getByText(/The department returned the implementation of REC-\d+ for more work: QA reason/).first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem("audit_locale", "ar"));
  await page.goto("/employee/notifications");
  await expect(page.getByText(/أعادت الإدارة التنفيذ للمزيد من العمل على REC-\d+: QA reason/).first()).toBeVisible();
});

test("BUG-18: password refusals say why, in the UI language, without stale errors", async ({ page, request }) => {
  await signIn(page, request, "employee2");
  await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
  await page.goto("/employee/profile");
  await page.getByRole("button", { name: /Change password/ }).first().click();
  const current = page.locator("main input[autocomplete=current-password]");
  const next = page.locator("main input[autocomplete=new-password]");
  const submit = page.locator("main form button[type=submit]").first();
  await current.fill("not-my-password");
  await next.nth(0).fill("Qa!Strong#2026x");
  await next.nth(1).fill("Qa!Strong#2026x");
  await submit.click();
  await expect(page.locator("main [role=alert]").first()).toContainText("Current password: The current password is incorrect.");
  await current.fill("E2e@12345");
  await next.nth(0).fill("password123");
  await next.nth(1).fill("password123");
  await submit.click();
  await expect(page.locator("main [role=alert]").first()).toContainText("too common");
  await expect(page.locator("main").getByText(/current password is incorrect/i)).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("audit_locale", "ar"));
  await page.reload();
  await page.getByRole("button", { name: /تغيير كلمة المرور/ }).first().click();
  await page.locator("main input[autocomplete=current-password]").fill("E2e@12345");
  await page.locator("main input[autocomplete=new-password]").nth(0).fill("password123");
  await page.locator("main input[autocomplete=new-password]").nth(1).fill("password123");
  await page.locator("main form button[type=submit]").first().click();
  await expect(page.locator("main [role=alert]").first()).toContainText("شائعة جداً");
});

test("BUG-11: an empty file says so in both languages; choosing another file clears it", async ({ page, request }) => {
  const { body: depts } = await apiGet<{ results: { id: number }[] }>(request, "audit", "/api/departments/");
  const { body: report } = await apiPost<{ id: number }>(request, "audit", "/api/reports/", {
    title: `QA empty file ${Date.now()}`, department: depts.results[0].id, engagement_type: "assurance",
  });
  const { body: rec } = await apiPost<{ id: number }>(request, "audit", "/api/recommendations/", {
    report: report.id, text: `QA empty ${Date.now()}`, risk_level: "low",
  });
  await apiPost(request, "audit", `/api/reports/${report.id}/submit-to-department/`);
  for (const [locale, expected] of [["en", "The file is empty."], ["ar", "الملف المرسل فارغ."]] as const) {
    await signIn(page, request, "head");
    await page.evaluate((l) => localStorage.setItem("audit_locale", l), locale);
    await page.goto(`/department/recommendations/${rec.id}`);
    await page.locator("main input[type=radio][name=response-decision]").nth(1).check();
    await page.locator("main textarea").first().fill("QA justification");
    await page.locator("main input[type=file]").first().setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await page.locator("main form button[type=submit]").first().click();
    await expect(page.locator("main [role=alert]").first()).toContainText(expected);
    await page.locator("main input[type=file]").first().setInputFiles({ name: "good.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(page.locator("main").getByText(expected)).toHaveCount(0);
  }
});
