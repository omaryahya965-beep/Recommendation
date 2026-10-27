import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet, findReport, tryFindReport } from "./support/api";
import { signIn } from "./support/auth";
import { uniqueSuffix } from "./support/env";
import { actionPanel, decide, expectStatus, isoDate, openCase } from "./support/workspace";

/**
 * The whole lifecycle, every action taken through the UI by the role that owns
 * it: issue -> response -> audit review -> council ratification -> plan ->
 * execution with evidence -> head review -> verification -> closure package ->
 * council closure.
 */
test("a recommendation travels from issue to council closure", async ({ page, request }) => {
  test.setTimeout(300_000);
  const reportTitle = `[E2E] دورة كاملة ${uniqueSuffix()}`;
  const findingTitle = `ضعف الرقابة على المخزون ${uniqueSuffix()}`;

  // --- Audit: create the report -------------------------------------------
  await signIn(page, request, "audit");
  await page.goto("/audit/reports/new");
  await page.getByLabel(T.reports.reportTitle).fill(reportTitle);
  await page.getByLabel(T.common.department).selectOption({ label: "الدائرة المالية" });
  await page.getByRole("button", { name: T.common.save, exact: true }).click();
  await expect(page.getByRole("heading", { name: reportTitle }).or(page.getByText(reportTitle)).first()).toBeVisible();
  await expect.poll(async () => (await tryFindReport(request, "audit", reportTitle))?.id ?? 0).toBeGreaterThan(0);
  const report = await findReport(request, "audit", reportTitle);

  // --- Audit: add the recommendation with the wizard ----------------------
  await page.goto(`/audit/recommendations/new?report=${report.id}`);
  await page.getByLabel(T.create.findingTitle).fill(findingTitle);
  await page.getByLabel(T.create.condition, { exact: false }).first().fill("لا يوجد جرد دوري موثق للمخزون.");
  await page.getByRole("button", { name: T.create.next }).click();
  await page.getByRole("button", { name: T.create.next }).click();
  await page.getByLabel(T.create.statement, { exact: false }).first().fill("اعتماد إجراء جرد ربع سنوي موثق.");
  await page.getByRole("button", { name: T.create.next }).click();
  await page.getByRole("button", { name: T.create.save }).click();
  await expect(page.getByText(T.create.saved).first()).toBeVisible();

  const { body: list } = await apiGet<{ results: Array<{ id: number }> }>(
    request,
    "audit",
    `/api/recommendations/?report=${report.id}`
  );
  const recId = list.results[0].id;

  // --- Audit: send the report to the department ---------------------------
  await page.goto(`/audit/reports/${report.id}`);
  await page.getByRole("button", { name: T.reports.submitToDepartment }).click();
  // Sending a report asks for confirmation first (BUG-09).
  await page.getByRole("alertdialog").getByRole("button", { name: T.reports.submitToDepartment }).click();
  await expectStatus(request, recId, "pending_response");

  // --- Head: respond (agree) ---------------------------------------------
  await signIn(page, request, "head");
  await openCase(page, "department_head", recId);
  await page.getByLabel(T.response.notes).fill("نوافق على التوصية وسنعد خطة.");
  await page.getByRole("button", { name: T.response.submit }).click();
  await expectStatus(request, recId, "audit_review");

  // --- Audit: accept the response, then send the report to council --------
  await signIn(page, request, "audit");
  await openCase(page, "audit", recId);
  await decide(page, T.auditReview.accept, "الرد مقبول.");
  await expectStatus(request, recId, "pending_council");
  await page.goto(`/audit/reports/${report.id}`);
  await page.getByRole("button", { name: T.reports.submitToCouncil }).click();
  // Sending a report asks for confirmation first (BUG-09).
  await page.getByRole("alertdialog").getByRole("button", { name: T.reports.submitToCouncil }).click();
  await expect
    .poll(async () => (await apiGet<{ status: string }>(request, "audit", `/api/reports/${report.id}/`)).body.status)
    .toBe("pending_council");

  // --- Council: ratify -----------------------------------------------------
  await signIn(page, request, "council");
  await page.goto("/council/pending-approvals");
  const card = page.locator("li", { hasText: reportTitle }).first();
  await card.getByRole("button", { name: T.dashboard.ratifyDecision }).click();
  await card.getByRole("button", { name: T.council.ratifyReport }).click();
  // Ratification is irreversible: it is always confirmed, with a preview of
  // what it approves and what it closes.
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(T.council.ratifyConfirmNoClose)).toBeVisible();
  await confirm.getByRole("button", { name: T.council.ratifyReport }).click();
  await expectStatus(request, recId, "action_plan_required");

  // --- Head: submit the action plan --------------------------------------
  const { body: employees } = await apiGet<Array<{ id: number; username: string }> | { results: Array<{ id: number; username: string }> }>(
    request,
    "head",
    "/api/employees/"
  );
  const employeeRows = Array.isArray(employees) ? employees : employees.results;
  const employee = employeeRows.find((row) => row.username === "emp_finance1");
  expect(employee).toBeTruthy();

  await signIn(page, request, "head");
  await openCase(page, "department_head", recId);
  await page.getByLabel(T.plan.owner).selectOption(String(employee!.id));
  await page.getByLabel(T.plan.targetDate).fill(isoDate(30));
  await page.getByLabel(`${T.plan.stepTitle} 1`).fill("تشكيل لجنة الجرد واعتماد النموذج");
  await page.getByRole("button", { name: T.plan.submit }).click();
  await expectStatus(request, recId, "action_plan_review");

  // --- Audit: approve the plan -------------------------------------------
  await signIn(page, request, "audit");
  await openCase(page, "audit", recId);
  await decide(page, T.plan.approve, "الخطة معتمدة.");
  await expectStatus(request, recId, "in_progress");

  // --- Employee: complete the step, upload evidence, submit ---------------
  await signIn(page, request, "employee");
  await openCase(page, "employee", recId);
  // Steps, evidence and submission share one desk in the action card.
  const desk = actionPanel(page);
  await desk.getByRole("button", { name: T.plan.markDone }).first().click();
  await expect(desk.getByRole("button", { name: T.plan.markUndone }).first()).toBeVisible();

  await desk.locator('input[type="file"]').first().setInputFiles({
    name: "inventory-count.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e inventory evidence"),
  });
  await desk.getByLabel(T.evidenceRegister.description).fill("محضر الجرد الموقع");
  await desk.getByRole("button", { name: T.evidenceRegister.upload }).click();
  await expect
    .poll(async () => (await apiGet<{ evidence_files: unknown[] }>(request, "audit", `/api/recommendations/${recId}/`)).body.evidence_files.length)
    .toBe(1);

  await desk.getByRole("button", { name: T.plan.markImplemented }).click();
  await expectStatus(request, recId, "pending_head_review");

  // --- Head: send the implementation to audit -----------------------------
  await signIn(page, request, "head");
  await openCase(page, "department_head", recId);
  await decide(page, T.case.headReviewAccept, "التنفيذ مكتمل.");
  await expectStatus(request, recId, "submitted_for_verification");

  // --- Audit: "Sufficient + send to council" (W4) -------------------------
  await signIn(page, request, "audit");
  await openCase(page, "audit", recId);
  await expect(page.getByLabel(T.verify.sendToCouncil)).toBeChecked();
  await page.getByRole("button", { name: T.verify.submitAndSend }).click();
  const verifyDialog = page.getByRole("alertdialog");
  await expect(verifyDialog.getByText(T.verify.confirmBoth)).toBeVisible();
  await verifyDialog.getByRole("button", { name: T.verify.submitAndSend }).click();
  await expectStatus(request, recId, "pending_closure_council");
  // Both underlying transitions are kept in the audit trail.
  const { body: verified } = await apiGet<{ trail: Array<{ action: string }> }>(
    request,
    "audit",
    `/api/recommendations/${recId}/`
  );
  const actions = verified.trail.map((entry) => entry.action);
  expect(actions).toContain("verified_sufficient");
  expect(actions).toContain("closure_submitted_to_council");

  // --- Council: close ------------------------------------------------------
  await signIn(page, request, "council");
  await openCase(page, "council", recId);
  await decide(page, T.verify.councilClose, "يوافق المجلس على الإغلاق.");
  await expectStatus(request, recId, "closed");
});
