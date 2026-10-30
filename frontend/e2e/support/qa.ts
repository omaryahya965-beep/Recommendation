/** Builders for the QA regression specs: real cases moved through the API. */
import { expect, type APIRequestContext } from "@playwright/test";

import { apiGet, apiLogin, apiPost } from "./api";
import { API_URL, uniqueSuffix } from "./env";

export function isoFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function caseInPlanStage(request: APIRequestContext, text = `QA integrity ${uniqueSuffix()}`) {
  const { body: depts } = await apiGet<{ results: { id: number }[] }>(request, "audit", "/api/departments/");
  const { body: report } = await apiPost<{ id: number }>(request, "audit", "/api/reports/", {
    title: `QA integrity ${uniqueSuffix()}`, department: depts.results[0].id, engagement_type: "assurance",
  });
  const { body: rec } = await apiPost<{ id: number }>(request, "audit", "/api/recommendations/", {
    report: report.id, text, risk_level: "medium",
  });
  await apiPost(request, "audit", `/api/reports/${report.id}/submit-to-department/`);
  await apiPost(request, "head", `/api/recommendations/${rec.id}/respond/`, { decision: "agree" });
  await apiPost(request, "audit", `/api/recommendations/${rec.id}/review/`, { accept: true });
  await apiPost(request, "audit", `/api/reports/${report.id}/submit-to-council/`);
  await apiPost(request, "council", `/api/reports/${report.id}/ratify/`, { notes: "" });
  return rec.id;
}

export async function caseAfterPartialVerification(request: APIRequestContext) {
  const id = await caseInPlanStage(request);
  const { body: emps } = await apiGet<{ results: { id: number; username: string }[] }>(request, "head", "/api/employees/");
  const emp = emps.results.find((e) => e.username === "emp_finance1")!;
  await apiPost(request, "head", `/api/recommendations/${id}/action-plan/`, {
    responsible_employee: emp.id, target_date: isoFromToday(30), steps: [{ title: "QA step" }],
  });
  await apiPost(request, "audit", `/api/recommendations/${id}/action-plan/review/`, { accept: true });
  const { body } = await apiGet<{ action_plan: { steps: { id: number }[] } }>(request, "employee", `/api/recommendations/${id}/`);
  await apiPost(request, "employee", `/api/recommendations/${id}/steps/${body.action_plan.steps[0].id}/progress/`, { is_done: true });
  const session = await apiLogin(request, "employee");
  const up = await request.post(`${API_URL}/api/recommendations/${id}/evidence/`, {
    headers: { Authorization: `Bearer ${session.access}` },
    multipart: { file: { name: "assessed.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 qa") }, notes: "assessed file" },
  });
  expect(up.status()).toBe(200);
  await apiPost(request, "employee", `/api/recommendations/${id}/mark-implemented/`);
  await apiPost(request, "head", `/api/recommendations/${id}/review-implementation/`, { accept: true });
  const v = await apiPost(request, "audit", `/api/recommendations/${id}/verify/`, {
    decision: "partial", notes: "reviewed assessed.pdf", rejected_items: "x", rejection_reason: "y",
    required_action: "z", action_deadline: isoFromToday(10),
  });
  expect(v.status).toBe(200);
  return id;
}
