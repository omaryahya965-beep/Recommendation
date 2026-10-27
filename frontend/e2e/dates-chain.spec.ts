/**
 * Round 2, 2.1: date-only values survive the whole chain (date input -> request
 * body -> server -> page, notification, reminder, register, follow-up) in any
 * browser time zone. The server runs in Asia/Gaza; the browser does not.
 * (The AI assistant's dates are formatted on the server; they are covered by
 * the backend tests in apps.ai.tests.test_answer_validation.)
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet, apiPost, findReport } from "./support/api";
import { signIn } from "./support/auth";
import { uniqueSuffix } from "./support/env";
import { manage } from "./support/hostile";
import { caseInPlanStage } from "./support/qa";
import { expectStatus, openCase } from "./support/workspace";

const YEAR = new Date().getFullYear() + 1;
const REPORT_DEADLINE = `${YEAR}-12-31`;
const PLAN_TARGET = `${YEAR}-12-15`;

/** How the app writes a calendar day, independent of any time zone. */
function written(iso: string, locale: "en" | "ar") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-EG-u-nu-latn", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(Date.UTC(y, m - 1, d));
}

/** Today on the server (Asia/Gaza), as YYYY-MM-DD. */
function serverDay(offset = 0) {
  const now = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Gaza" }).format(now);
}

async function employeeId(request: APIRequestContext) {
  const { body } = await apiGet<{ results: { id: number; username: string }[] }>(request, "head", "/api/employees/");
  return body.results.find((e) => e.username === "emp_finance1")!.id;
}

for (const timezoneId of ["America/Los_Angeles", "UTC", "Pacific/Kiritimati"]) {
  test.describe(`time zone ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("report deadline, notification, plan target and register keep the day entered", async ({ page, request }) => {
      test.setTimeout(240_000);
      const title = `QA dates ${uniqueSuffix()}`;

      // Report deadline through the form.
      await signIn(page, request, "audit");
      await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
      await page.goto("/audit/reports/new");
      await page.getByLabel("Report title").fill(title);
      await page.locator("main select").first().selectOption({ index: 1 });
      await page.locator('main input[type="date"]').first().fill(REPORT_DEADLINE);
      await page.locator('main form button[type="submit"]').first().click();
      await expect(page.getByRole("heading", { name: "The report has been created" })).toBeVisible();
      const reportId = (await findReport(request, "audit", title)).id;
      await page.goto(`/audit/reports/${reportId}`);
      const { body: report } = await apiGet<{ response_deadline: string; department: number }>(request, "audit", `/api/reports/${reportId}/`);
      expect(report.response_deadline).toBe(REPORT_DEADLINE);
      await expect(page.locator("main").getByText(written(REPORT_DEADLINE, "en")).first()).toBeVisible();
      await page.reload();
      await expect(page.locator("main").getByText(written(REPORT_DEADLINE, "en")).first()).toBeVisible();

      // The department's notification states the same day.
      const { body: rec } = await apiPost<{ id: number }>(request, "audit", "/api/recommendations/", {
        report: reportId, text: `${title} case`, risk_level: "low",
      });
      expect((await apiPost(request, "audit", `/api/reports/${reportId}/submit-to-department/`)).status).toBe(200);
      await signIn(page, request, "head");
      await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
      await page.goto("/department/notifications");
      await expect(page.locator("main").getByText(new RegExp(`response due [\u2066-\u2069]?${written(REPORT_DEADLINE, "en")}`)).first()).toBeVisible();

      // Plan target through the plan form.
      await apiPost(request, "head", `/api/recommendations/${rec.id}/respond/`, { decision: "agree" });
      await apiPost(request, "audit", `/api/recommendations/${rec.id}/review/`, { accept: true });
      await apiPost(request, "audit", `/api/reports/${reportId}/submit-to-council/`);
      await apiPost(request, "council", `/api/reports/${reportId}/ratify/`, { notes: "" });
      await page.evaluate(() => localStorage.setItem("audit_locale", "ar"));
      await openCase(page, "department_head", rec.id);
      await page.getByLabel(T.plan.owner).selectOption(String(await employeeId(request)));
      await page.getByLabel(T.plan.targetDate).fill(PLAN_TARGET);
      await page.getByLabel(`${T.plan.stepTitle} 1`).fill("QA date step");
      await page.getByRole("button", { name: T.plan.submit }).click();
      await expectStatus(request, rec.id, "action_plan_review");
      const { body: detail } = await apiGet<{ action_plan: { target_date: string } }>(request, "head", `/api/recommendations/${rec.id}/`);
      expect(detail.action_plan.target_date).toBe(PLAN_TARGET);
      await apiPost(request, "audit", `/api/recommendations/${rec.id}/action-plan/review/`, { accept: true });
      await page.reload();
      await expect(page.locator("main").getByText(written(PLAN_TARGET, "ar")).first()).toBeVisible();

      // The register's binding deadline column.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/department/recommendations?search=${encodeURIComponent(`REC-${rec.id}`)}`);
      const row = page.locator("main table tbody tr").filter({ hasText: `REC-${String(rec.id).padStart(4, "0")}` });
      await expect(row).toContainText(written(PLAN_TARGET, "ar"));
    });

    test("a reminder states the deadline day and the real number of days", async ({ page, request }) => {
      test.setTimeout(180_000);
      const id = await caseInPlanStage(request);
      const target = serverDay(3);
      await apiPost(request, "head", `/api/recommendations/${id}/action-plan/`, {
        responsible_employee: await employeeId(request), target_date: target, steps: [{ title: "QA reminder step" }],
      });
      await apiPost(request, "audit", `/api/recommendations/${id}/action-plan/review/`, { accept: true });
      manage("send_reminders");
      await signIn(page, request, "employee");
      await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
      await page.goto("/employee/notifications");
      const ref = `REC-${String(id).padStart(4, "0")}`;
      const reminder = page.locator("main").getByText(new RegExp(`Reminder: 3 days left .*${written(target, "en")}.*${ref}`)).first();
      await expect(reminder).toBeVisible();
    });

    test("a follow-up period includes a case issued on its first or last day", async ({ page, request }) => {
      test.setTimeout(180_000);
      const id = await caseInPlanStage(request); // issued today, server time
      const day = serverDay();
      for (const [start, end] of [[day, day], [serverDay(-1), day], [day, serverDay(1)]]) {
        const res = await apiPost<{ snapshot: { items: { id: number; issued_in_period: boolean }[] } }>(
          request, "audit", "/api/followup-reports/preview/", { period_start: start, period_end: end, language: "ar" }
        );
        expect(res.status).toBe(200);
        const item = res.body.snapshot.items.find((i) => i.id === id);
        expect(item, `${start}..${end}`).toBeTruthy();
        expect(item!.issued_in_period, `${start}..${end}`).toBe(true);
      }
      // The same period through the form, shown back unchanged.
      await signIn(page, request, "audit");
      await page.evaluate(() => localStorage.setItem("audit_locale", "en"));
      await page.goto("/audit/followup-reports");
      await page.getByLabel("From").fill(day);
      await page.getByLabel("To").fill(day);
      await page.getByRole("button", { name: /Preview|Generate/ }).first().click();
      const header = page.getByTestId("followup-report").first();
      await expect(header).toBeVisible();
      // Dates are wrapped in bidi isolates (U+2066-U+2069) for mixed-direction text.
      await expect
        .poll(async () => (await header.innerText()).replace(/[⁦-⁩]/g, ""))
        .toContain(`${written(day, "en")} — ${written(day, "en")}`);
    });
  });
}
