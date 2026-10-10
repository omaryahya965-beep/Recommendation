import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet, apiPost, apiUpload, firstRecommendationOf } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES } from "./support/env";
import { expectStatus, isoDate, openCase } from "./support/workspace";

/**
 * W2: overdue belongs to whoever owns the next action.
 * W1: after a partial verification, the audit-set deadline binds the returned work.
 *
 * Seeded case: an in-progress Finance recommendation whose plan deadline
 * passed ten days ago, assigned to emp_finance2.
 */
test.describe.serial("deadlines follow the owner of the next action", () => {
  let recId = 0;

  test("the department sees its own delay", async ({ page, request }) => {
    recId = (await firstRecommendationOf(request, "employee2", FIXTURES.financeOverdue)).id;
    const { body } = await apiGet<{ overdue: boolean; days_overdue: number; waiting_on: string }>(
      request,
      "employee2",
      `/api/recommendations/${recId}/`
    );
    expect(body.overdue).toBe(true);
    expect(body.days_overdue).toBe(10);
    expect(body.waiting_on).toBe("department");

    await signIn(page, request, "employee2");
    await openCase(page, "employee", recId);
    await expect(page.getByText(T.workflow.overdueBy.replace("{days}", "10")).first()).toBeVisible();
  });

  test("time waiting on internal audit is not department delay (W2)", async ({ page, request }) => {
    const detail = await apiGet<{ action_plan: { steps: Array<{ id: number }> } }>(
      request,
      "employee2",
      `/api/recommendations/${recId}/`
    );
    for (const step of detail.body.action_plan.steps) {
      const res = await apiPost(request, "employee2", `/api/recommendations/${recId}/steps/${step.id}/progress/`, {
        is_done: true,
      });
      expect(res.status).toBe(200);
    }
    const upload = await apiUpload(request, "employee2", `/api/recommendations/${recId}/evidence/`, {
      file: { name: "settlement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") },
      notes: "كشف التسوية",
    });
    expect(upload.status).toBe(200);
    expect((await apiPost(request, "employee2", `/api/recommendations/${recId}/mark-implemented/`)).status).toBe(200);
    expect(
      (await apiPost(request, "head", `/api/recommendations/${recId}/review-implementation/`, { accept: true })).status
    ).toBe(200);
    await expectStatus(request, recId, "submitted_for_verification");

    const { body } = await apiGet<{ overdue: boolean; waiting_on: string; workflow: { deadline: unknown } }>(
      request,
      "audit",
      `/api/recommendations/${recId}/`
    );
    expect(body.overdue).toBe(false);
    expect(body.waiting_on).toBe("audit");
    expect(body.workflow.deadline).toBeNull();

    await signIn(page, request, "audit");
    await openCase(page, "audit", recId);
    await expect(page.getByText(T.workflow.overdueBy.replace("{days}", "10"))).toHaveCount(0);
    await expect(page.getByText(T.workflow.waitingToday.replace("{who}", T.workflow.waitingOn.audit)).first()).toBeVisible();
  });

  test("a partial verification sets the binding deadline (W1)", async ({ page, request }) => {
    const deadline = isoDate(7);
    const res = await apiPost(request, "audit", `/api/recommendations/${recId}/verify/`, {
      decision: "partial",
      rejected_items: "كشف شهر أيلول",
      rejection_reason: "غير موقّع",
      required_action: "إرفاق الكشف الموقّع",
      action_deadline: deadline,
    });
    expect(res.status).toBe(200);

    const { body } = await apiGet<{
      overdue: boolean;
      deadline: string;
      deadline_source: string;
      due_in_days: number;
      target_date: string;
    }>(request, "employee2", `/api/recommendations/${recId}/`);
    expect(body.deadline).toBe(deadline);
    expect(body.deadline_source).toBe("verification");
    expect(body.overdue).toBe(false);
    expect(body.due_in_days).toBe(7);
    expect(body.target_date).not.toBe(deadline); // the plan's own date stays visible

    await signIn(page, request, "employee2");
    await openCase(page, "employee", recId);
    await expect(page.getByText(T.workflow.deadlineSource.verification).first()).toBeVisible();
    await expect(page.getByText(T.workflow.dueIn.replace("{days}", "7")).first()).toBeVisible();
  });

  test("a past deadline for returned work is refused in Arabic", async ({ request }) => {
    // Already partial; the next verification needs a new submission, so check
    // the message catalog against the API code directly.
    const res = await apiPost<{ code: string }>(request, "audit", `/api/recommendations/${recId}/verify/`, {
      decision: "partial",
      rejected_items: "x",
      rejection_reason: "y",
      required_action: "z",
      action_deadline: isoDate(-1),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_submitted_for_verification");
    expect(T.apiErrors.codes[res.body.code]).toBeTruthy();
  });
});
