/**
 * Round 2, Part 2.2: items earlier marked NOT-REPRODUCED, re-tested in the UI.
 */
import { expect, test } from "@playwright/test";

import { T as AR } from "../lib/i18n/ar";
import { apiGet, apiPost } from "./support/api";
import { signIn } from "./support/auth";
import type { UserKey } from "./support/env";
import { caseAfterPartialVerification } from "./support/qa";

test("team progress is never 100% while an assigned case is open", async ({ page, request }) => {
  const { body } = await apiGet<{ employees: { employee: { id: number; name: string }; open: number; completed: number; completion_rate: number }[] }>(
    request, "head", "/api/team/workload/"
  );
  expect(body.employees.some((row) => row.open > 0)).toBe(true);
  await signIn(page, request, "head");
  await page.goto("/department/team-progress");
  for (const row of body.employees) {
    const bar = page.getByRole("progressbar", { name: `${AR.team.completionLabel} — ${row.employee.name}` });
    await expect(bar).toBeVisible();
    const value = Number(await bar.getAttribute("aria-valuenow"));
    expect(value, row.employee.name).toBe(row.completion_rate);
    if (row.open > 0) expect(value, `${row.employee.name} has ${row.open} open`).toBeLessThan(100);
    const total = row.completed + row.open;
    await expect(page.locator("main").getByText(
      AR.team.completion.replace("{done}", String(row.completed)).replace("{total}", String(total))
    ).first()).toBeVisible();
  }
});

for (const [who, path, base] of [
  ["head", "/department/recommendations", "/department/recommendations/"],
  ["employee", "/employee/recommendations", "/employee/my-tasks/"],
] as Array<[UserKey, string, string]>) {
  test(`${who}: clicking the title of every register row opens that case`, async ({ page, request }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, request, who);
    await page.goto(path);
    const rows = page.locator("main table tbody tr");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const row = page.locator("main table tbody tr").nth(i);
      const code = (await row.locator("td").first().innerText()).trim();
      const id = Number(code.replace(/\D/g, ""));
      await row.locator("td").nth(1).locator("a").click();
      await expect(page, code).toHaveURL(new RegExp(`${base}${id}(\\?|#|$)`));
      await expect(page.locator("main").getByText(code).first()).toBeVisible();
      await page.goBack();
      await expect(page.locator("main table tbody tr").first()).toBeVisible();
    }
  });
}

test("2.3: the verification summary always shows the latest decision", async ({ page, request }) => {
  test.setTimeout(240_000);
  const id = await caseAfterPartialVerification(request);
  const summary = async () => {
    await page.goto(`/audit/recommendations/${id}`);
    const header = page.locator("main button").filter({ hasText: AR.case.verification }).first();
    await expect(header).toBeVisible();
    return header;
  };
  // The section header's status pill names the latest decision.
  const PILL = AR.caseView.sectionStatus;
  const expectPill = async (latest: "partial" | "sufficient") => {
    const header = await summary();
    await expect(header).toContainText(PILL[latest]);
    await expect(header).not.toContainText(PILL[latest === "partial" ? "sufficient" : "partial"]);
    return header;
  };
  // The verification part opens as a panel over the page.
  const firstDecision = () => page.getByRole("dialog").locator("li").filter({ hasText: /كافية|جزئية|غير كافية/ }).first();
  await signIn(page, request, "audit");
  await expectPill("partial");

  // Corrected evidence, resubmitted, Sufficient.
  expect((await apiPost(request, "employee", `/api/recommendations/${id}/mark-implemented/`)).status).toBe(200);
  await apiPost(request, "head", `/api/recommendations/${id}/review-implementation/`, { accept: true });
  await apiPost(request, "audit", `/api/recommendations/${id}/verify/`, { decision: "sufficient", notes: "complete" });
  await expectPill("sufficient");

  // Council reopens: the summary still names the latest verification (Sufficient).
  await apiPost(request, "audit", `/api/recommendations/${id}/submit-for-closure/`, { notes: "package" });
  await apiPost(request, "council", `/api/recommendations/${id}/council-closure/`, { accept: false, notes: "cover Q4" });
  await expectPill("sufficient");

  // Resubmitted and verified Partial again: newest wins, history newest first.
  await apiPost(request, "employee", `/api/recommendations/${id}/mark-implemented/`);
  await apiPost(request, "head", `/api/recommendations/${id}/review-implementation/`, { accept: true });
  await apiPost(request, "audit", `/api/recommendations/${id}/verify/`, {
    decision: "partial", notes: "q4", rejected_items: "Q4", rejection_reason: "Q4 missing", required_action: "add Q4",
    action_deadline: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
  });
  const header = await expectPill("partial");
  await header.click();
  await expect(firstDecision()).toContainText("Q4 missing");
});
