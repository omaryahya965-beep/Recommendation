/** Shared constants for the browser suite. Mirrors backend `e2e_reset`. */
export const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? 8100}`;

export const PASSWORD = "E2e@12345";

export const USERS = {
  audit: "audit1",
  head: "head_finance",
  headEng: "head_eng",
  employee: "emp_finance1",
  employee2: "emp_finance2",
  employeeEng: "emp_eng1",
  council: "council1",
} as const;

export type UserKey = keyof typeof USERS;

export const ROLE_HOME: Record<string, RegExp> = {
  audit: /\/audit\/dashboard/,
  department_head: /\/department\/dashboard/,
  employee: /\/employee\/my-tasks/,
  council: /\/council\/pending-approvals/,
};

/** Titles of the seeded reports (see backend/apps/core/management/commands/e2e_reset.py). */
export const FIXTURES = {
  engineeringPending: "[E2E] تقرير الهندسة — بانتظار الرد",
  financeInProgress: "[E2E] تقرير المالية — قيد التنفيذ",
  financeOverdue: "[E2E] تقرير المالية — متأخرة",
  financeAwaitingClosure: "[E2E] تقرير المالية — بانتظار الإغلاق",
  financeDraft: "[E2E] تقرير المالية — مسودة",
} as const;

/** A unique suffix so specs that create data never collide across runs. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}
