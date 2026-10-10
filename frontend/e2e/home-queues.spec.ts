import { expect, test, type APIRequestContext } from "@playwright/test";

import { REPORT_STATUS_LABELS, T } from "../lib/i18n/ar";
import { apiGet, apiPost, findReport } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES, uniqueSuffix } from "./support/env";

/**
 * The audit home's work queues and the notification deep links. Every
 * "عرض المزيد" opens the register (or the reports list) with exactly the
 * subset its count was made of, in the same order, and says which queue it is.
 */

interface Block {
  count: number;
  items: Array<{ id: number; waiting_since: string | null }>;
}

interface AuditHome {
  action_center: Record<string, Block>;
  draft_reports: { count: number };
}

const REVIEW_QUEUES = ["responses_to_review", "plans_to_review", "verifications_pending", "closure_reviews"];

function isoIn(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** A new Finance report whose two cases reach audit's review queue one after the other. */
async function twoResponsesForAudit(request: APIRequestContext) {
  const suffix = uniqueSuffix();
  const seed = await findReport(request, "audit", FIXTURES.financeInProgress);
  const { body: seedReport } = await apiGet<{ department: number }>(request, "audit", `/api/reports/${seed.id}/`);
  const report = await apiPost<{ id: number }>(request, "audit", "/api/reports/", {
    title: `[E2E] أولويات الرقابة ${suffix}`,
    department: seedReport.department,
    engagement_type: "assurance",
    response_deadline: isoIn(14),
  });
  expect(report.status, JSON.stringify(report.body)).toBe(201);
  const ids: number[] = [];
  for (const name of ["الأقدم وصولاً", "الأحدث وصولاً"]) {
    const rec = await apiPost<{ id: number }>(request, "audit", "/api/recommendations/", {
      report: report.body.id,
      text: `العنوان:\n${name} ${suffix}\n`,
      risk_level: "medium",
    });
    expect(rec.status, JSON.stringify(rec.body)).toBe(201);
    ids.push(rec.body.id);
  }
  expect((await apiPost(request, "audit", `/api/reports/${report.body.id}/submit-to-department/`)).status).toBe(200);
  for (const id of ids) {
    const res = await apiPost(request, "head", `/api/recommendations/${id}/respond/`, { decision: "agree", justification: "نوافق" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
  return { reportId: report.body.id, older: ids[0], newer: ids[1] };
}

test("the audit home shows work queues, newest arrival first, without the retired blocks", async ({ page, request }) => {
  const { older, newer } = await twoResponsesForAudit(request);
  const { body } = await apiGet<AuditHome>(request, "audit", "/api/dashboard/");
  const responses = body.action_center.responses_to_review;
  expect(responses.items.map((item) => item.id).slice(0, 2)).toEqual([newer, older]);

  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  const priorities = page.getByTestId("audit-priorities");
  await expect(priorities).toBeVisible();

  // Retired: recurrence confirmation, overdue by department, late in our queue, stale high risk.
  for (const title of ["تأكيد التكرار", "المتأخرات حسب الدائرة", "متأخرة لدينا", "عالية الخطورة دون حركة"]) {
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  }
  for (const id of ["overdue-by-department", "late-in-queue"]) await expect(page.getByTestId(id)).toHaveCount(0);

  // "All": every review queue merged, newest arrival first.
  const merged = REVIEW_QUEUES.flatMap((queue) => body.action_center[queue]?.items ?? [])
    .sort((a, b) => Date.parse(b.waiting_since ?? "0") - Date.parse(a.waiting_since ?? "0") || b.id - a.id)
    .slice(0, 6)
    .map((item) => String(item.id));
  const rows = priorities.getByTestId("queue-item");
  await expect(rows).toHaveCount(merged.length);
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")))).toEqual(merged);

  // Each row says why it is here and opens the case at the section the work is in.
  const newest = priorities.locator(`[data-testid=queue-item][data-id="${newer}"]`);
  await expect(newest.getByTestId("queue-reason")).toHaveText(T.queues.responses_to_review);
  await expect(newest).toHaveAttribute("href", `/audit/recommendations/${newer}?section=response`);

  // One queue: its reason sentence, its rows, and "view more" with its exact subset.
  await priorities.getByRole("button", { name: new RegExp(T.queues.responses_to_review) }).click();
  await expect(priorities.getByTestId("queue-why")).toHaveText(T.queues.responses_to_reviewHint);
  const ids = await rows.evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-id"))));
  expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
  await priorities.getByTestId("priorities-more").click();
  await expect(page).toHaveURL(/queue=responses_to_review/);
  await expect(page).toHaveURL(/status=audit_review/);
  await expect(page).toHaveURL(/ordering=-waiting/);
  await expect(page.getByTestId("register-queue-header")).toHaveAttribute("data-queue", "responses_to_review");
  await expect(page.getByRole("heading", { level: 1, name: T.queues.responses_to_review })).toBeVisible();
  await expect(page.getByRole("button", { name: T.queues.queueChip.replace("{name}", T.queues.responses_to_review) })).toBeVisible();
  const { body: list } = await apiGet<{ count: number; results: Array<{ id: number }> }>(
    request,
    "audit",
    "/api/recommendations/?status=audit_review&ordering=-waiting"
  );
  expect(list.count).toBe(responses.count);
  expect(list.results[0].id).toBe(newer);

  // Removing the queue chip returns to the full register.
  await page.getByRole("button", { name: T.queues.queueChip.replace("{name}", T.queues.responses_to_review) }).click();
  await expect(page).not.toHaveURL(/queue=/);
  await expect(page.getByTestId("register-queue-header")).toHaveCount(0);
});

test("every view-more on the audit home opens the exact list it counted", async ({ page, request }) => {
  const { body } = await apiGet<AuditHome>(request, "audit", "/api/dashboard/");
  await signIn(page, request, "audit");

  // All review queues together.
  await page.goto("/audit/dashboard");
  await page.getByTestId("priorities-more").click();
  await expect(page).toHaveURL(/queue=audit_priorities/);
  await expect(page.getByRole("heading", { level: 1, name: T.queues.audit_priorities })).toBeVisible();
  const total = REVIEW_QUEUES.reduce((sum, queue) => sum + (body.action_center[queue]?.count ?? 0), 0);
  const statuses = new URL(page.url()).searchParams.get("status__in");
  const { body: union } = await apiGet<{ count: number }>(request, "audit", `/api/recommendations/?status__in=${statuses}`);
  expect(union.count).toBe(total);

  // Overdue at departments.
  await page.goto("/audit/dashboard");
  const overdue = page.getByTestId("department-overdue");
  if (body.action_center.overdue.count) {
    await overdue.getByTestId("department-overdue-more").click();
    await expect(page).toHaveURL(/queue=department_overdue/);
    await expect(page.getByRole("heading", { level: 1, name: T.queues.department_overdue })).toBeVisible();
    const { body: late } = await apiGet<{ count: number }>(request, "audit", "/api/recommendations/?overdue=true");
    expect(late.count).toBe(body.action_center.overdue.count);
  }

  // Drafts open the reports list on the draft tab.
  await page.goto("/audit/dashboard");
  await page.getByTestId("draft-reports-more").click();
  await expect(page).toHaveURL(/\/audit\/reports\?status=draft/);
  await expect(page.getByRole("button", { name: new RegExp(`^${REPORT_STATUS_LABELS.draft}`) }).first()).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByText(FIXTURES.financeDraft).filter({ visible: true }).first()).toBeVisible();
});

test("a notification opens its case at the right section and is marked read", async ({ page, request }) => {
  const { newer } = await twoResponsesForAudit(request);
  const { body } = await apiGet<{ results: Array<{ id: number; recommendation: number | null; is_read: boolean }> }>(
    request,
    "audit",
    "/api/notifications/?page_size=100"
  );
  const note = body.results.find((item) => item.recommendation === newer && !item.is_read);
  expect(note, "audit is told about the new response").toBeTruthy();

  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  await page.locator("[data-testid=notification-bell]:visible").click();
  const panel = page.getByTestId("notification-panel");
  await expect(panel).toBeVisible();
  const item = panel.locator(`[data-testid=notification-item][data-id="${note!.id}"]`);
  await expect(item).toHaveAttribute("data-read", "false");
  await expect(item.getByTestId("notification-target")).toHaveText(
    T.notify.opensAt.replace("{section}", T.case.response)
  );
  await item.getByRole("link").click();

  await expect(page).toHaveURL(new RegExp(`/audit/recommendations/${newer}\\?section=response`));
  await expect(page.locator("#section-response button[aria-expanded]").first()).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveCount(0);
  await expect
    .poll(async () => {
      const { body: after } = await apiGet<{ results: Array<{ id: number; is_read: boolean }> }>(
        request,
        "audit",
        "/api/notifications/?page_size=100"
      );
      return after.results.find((row) => row.id === note!.id)?.is_read;
    })
    .toBe(true);
});

test("the inbox filters by read state and opens a report notification at its report", async ({ page, request }) => {
  const { reportId } = await twoResponsesForAudit(request);
  const { body } = await apiGet<{
    results: Array<{ id: number; report: number | null; recommendation: number | null; is_read: boolean }>;
  }>(request, "head", "/api/notifications/?page_size=100");
  const note = body.results.find((item) => item.report === reportId && item.recommendation === null);
  expect(note, "the head is told about the new report").toBeTruthy();

  await signIn(page, request, "head");
  await page.goto("/department/notifications");
  const center = page.getByTestId("notification-center");
  await expect(center).toBeVisible();

  // Unread only, then read only.
  await center.locator("[data-filter=unread]").click();
  await expect(center.locator("[data-testid=notification-item][data-read=true]")).toHaveCount(0);
  await center.locator("[data-filter=read]").click();
  await expect(center.locator("[data-testid=notification-item][data-read=false]")).toHaveCount(0);
  await center.locator("[data-filter=all]").click();

  const item = center.locator(`[data-testid=notification-item][data-id="${note!.id}"]`);
  await expect(item.getByTestId("notification-target")).toHaveText(T.notify.openReport);
  await item.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/department/recommendations\\?report=${reportId}`));
  await expect(page.getByRole("button", { name: T.register.chipReport })).toBeVisible();

  // Old links to the settings tab land on the inbox.
  await page.goto("/department/settings?tab=notifications");
  await expect(page).toHaveURL(/\/department\/notifications$/);
});
