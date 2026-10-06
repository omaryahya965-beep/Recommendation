/**
 * Named register views opened from the home pages ("عرض المزيد"). Each is
 * the exact filter the server used for the dashboard count, plus the order
 * the dashboard listed it in, so the list carries on where the preview ended.
 *
 * The URL keeps the plain filters (shareable, saved views keep working) and
 * adds `queue=<id>`, which only names the view: the register's title, its
 * chip, and the default name of a saved view.
 */
import { currentT } from "./i18n/messages";

export type QueueId =
  | "audit_priorities"
  | "responses_to_review"
  | "plans_to_review"
  | "verifications_pending"
  | "closure_reviews"
  | "department_overdue"
  | "open_cases"
  | "high_risk_open"
  | "closed_cases";

/** The four audit review queues, in workflow order. */
export const AUDIT_REVIEW_QUEUES = [
  "responses_to_review",
  "plans_to_review",
  "verifications_pending",
  "closure_reviews",
] as const;

export type AuditReviewQueue = (typeof AUDIT_REVIEW_QUEUES)[number];

export const AUDIT_REVIEW_STATUS: Record<AuditReviewQueue, string> = {
  responses_to_review: "audit_review",
  plans_to_review: "action_plan_review",
  verifications_pending: "submitted_for_verification",
  closure_reviews: "closure_review",
};

// "-waiting": newest arrival in the status first (the dashboards' order).
const QUEUE_PARAMS: Record<QueueId, Record<string, string>> = {
  audit_priorities: {
    status__in: AUDIT_REVIEW_QUEUES.map((queue) => AUDIT_REVIEW_STATUS[queue]).join(","),
    ordering: "-waiting",
  },
  responses_to_review: { status: AUDIT_REVIEW_STATUS.responses_to_review, ordering: "-waiting" },
  plans_to_review: { status: AUDIT_REVIEW_STATUS.plans_to_review, ordering: "-waiting" },
  verifications_pending: { status: AUDIT_REVIEW_STATUS.verifications_pending, ordering: "-waiting" },
  closure_reviews: { status: AUDIT_REVIEW_STATUS.closure_reviews, ordering: "-waiting" },
  department_overdue: { overdue: "1", ordering: "deadline" },
  open_cases: { open: "true", issued: "true" },
  high_risk_open: { risk_level: "high", open: "true", issued: "true" },
  closed_cases: { status: "closed" },
};

export function isQueueId(value: string | null | undefined): value is QueueId {
  return Boolean(value && value in QUEUE_PARAMS);
}

/** The register URL for a queue, e.g. `/audit/recommendations?queue=…&status=…`. */
export function queueHref(base: string, id: QueueId): string {
  return `${base}?${new URLSearchParams({ queue: id, ...QUEUE_PARAMS[id] })}`;
}

/** The URL parameters that define the queue's subset (ordering excluded). */
export function queueFilterKeys(id: QueueId): string[] {
  return Object.keys(QUEUE_PARAMS[id]).filter((key) => key !== "ordering");
}

/** Every parameter the queue sets, to clear it in one step. */
export function queueParamKeys(id: QueueId): string[] {
  return ["queue", ...Object.keys(QUEUE_PARAMS[id])];
}

/**
 * The queue the register is showing: named in the URL and its filters still
 * in place (changing one of them turns the view back into a plain filter).
 */
export function activeQueue(params: URLSearchParams): QueueId | null {
  const id = params.get("queue");
  if (!isQueueId(id)) return null;
  return queueFilterKeys(id).every((key) => params.get(key) === QUEUE_PARAMS[id][key]) ? id : null;
}

export function queueTitle(id: QueueId): string {
  return currentT().queues[id];
}

/** Why a case is in this queue (one sentence). */
export function queueHint(id: QueueId): string {
  return currentT().queues[`${id}Hint`];
}
