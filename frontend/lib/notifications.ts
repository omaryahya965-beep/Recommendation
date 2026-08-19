import { caseTitle } from "./finding";
import { recordCode } from "./format";
import { currentT } from "./i18n/messages";
import type { AppNotification, NotificationType, RecommendationStatus, Role } from "./types";
import { isWaitingOn, stageForStatus, STATUS_NEXT_ACTION } from "./workflow";

/**
 * Backend `Notification.type` values only. `status_change` exists on the
 * model but is not currently emitted by workflow or reminders — it is still
 * mapped so a stored row would render correctly.
 */
export type NotifyCategory = "overdue" | "due" | "returned" | "action" | "deadline" | "status";

export interface NotifyMeta {
  type: NotificationType;
  category: NotifyCategory;
  label: string;
  /** Controlled tone. Never color-only. */
  tone: "danger" | "warning" | "primary" | "info" | "neutral";
  marker: string;
  priority: number;
  actionable: boolean;
}

const NOTIFY_BASE: Record<NotificationType, Omit<NotifyMeta, "label">> = {
  overdue: {
    type: "overdue",
    category: "overdue",
    tone: "danger",
    marker: "●",
    priority: 1,
    actionable: true,
  },
  due_today: {
    type: "due_today",
    category: "due",
    tone: "warning",
    marker: "●",
    priority: 2,
    actionable: true,
  },
  returned: {
    type: "returned",
    category: "returned",
    tone: "danger",
    marker: "●",
    priority: 3,
    actionable: true,
  },
  action_required: {
    type: "action_required",
    category: "action",
    tone: "primary",
    marker: "●",
    priority: 4,
    actionable: true,
  },
  response_needed: {
    type: "response_needed",
    category: "action",
    tone: "primary",
    marker: "●",
    priority: 5,
    actionable: true,
  },
  deadline_approaching: {
    type: "deadline_approaching",
    category: "deadline",
    tone: "warning",
    marker: "●",
    priority: 6,
    actionable: true,
  },
  status_change: {
    type: "status_change",
    category: "status",
    tone: "neutral",
    marker: "○",
    priority: 7,
    actionable: false,
  },
};

export function notifyMeta(type: string): NotifyMeta {
  const T = currentT();
  const labels: Record<NotificationType, string> = {
    overdue: T.notify.overdue,
    due_today: T.notify.dueToday,
    returned: T.notify.returned,
    action_required: T.notify.actionRequired,
    response_needed: T.notify.responseNeeded,
    deadline_approaching: T.notify.deadline,
    status_change: T.notify.statusChange,
  };
  const key = (type in NOTIFY_BASE ? type : "status_change") as NotificationType;
  const base = NOTIFY_BASE[key];
  return { ...base, label: labels[key] };
}

export function notificationsCenter(role: Role): string {
  if (role === "audit") return "/audit/settings?tab=notifications";
  if (role === "department_head") return "/department/settings?tab=notifications";
  if (role === "employee") return "/employee/settings?tab=notifications";
  return "/council/settings?tab=notifications";
}

export function recBase(role: Role): string {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/my-tasks";
  return "/council/recommendations";
}

export type WorkspaceTab =
  | "overview"
  | "finding"
  | "response"
  | "plan"
  | "evidence"
  | "verification"
  | "approvals"
  | "trail";

/** Deep-link tab derived from the real type + current status. */
export function notificationTab(item: AppNotification): WorkspaceTab {
  const status = item.status;
  const type = item.type;

  if (type === "response_needed") return "response";

  if (type === "returned") {
    if (status === "returned_for_revision") return "response";
    if (status === "revision_required") return "plan";
    if (status === "returned_insufficient" || status === "reopened" || status === "partial") {
      return "evidence";
    }
    return "plan";
  }

  if (type === "action_required") {
    if (status === "audit_review") return "response";
    if (status === "pending_council") return "approvals";
    if (
      status === "action_plan_review" ||
      status === "action_plan_required" ||
      status === "approved_for_implementation" ||
      status === "revision_required" ||
      status === "in_progress" ||
      status === "action_plan_approved" ||
      status === "pending_head_review"
    ) {
      return "plan";
    }
    if (
      status === "submitted_for_verification" ||
      status === "closure_review" ||
      status === "pending_closure_council"
    ) {
      return "verification";
    }
  }

  if (type === "overdue" || type === "due_today" || type === "deadline_approaching") return "plan";
  return "overview";
}

export function notificationHref(item: AppNotification, role: Role): string {
  if (item.recommendation) {
    const tab = notificationTab(item);
    return `${recBase(role)}/${item.recommendation}?tab=${tab}`;
  }
  if (role === "council") return "/council/pending-approvals";
  if (role === "department_head") return "/department/recommendations";
  if (role === "audit") return "/audit/reports";
  return recBase(role);
}

export function notificationTitle(item: AppNotification): string {
  const T = currentT();
  if (item.recommendation) {
    return caseTitle(item.recommendation_text ?? "", 90) || recordCode(item.recommendation);
  }
  return item.report_title || item.message.split(":")[0] || T.notify.title;
}

export function requiredAction(item: AppNotification, role?: Role): string | null {
  const T = currentT();
  if (item.status && (!role || isWaitingOn(item.status, role))) {
    const next = STATUS_NEXT_ACTION[item.status as RecommendationStatus];
    if (next) return next.action;
  }
  const type = item.type;
  if (type === "response_needed") return T.notify.actionRespond;
  if (type === "returned") return T.notify.actionReturned;
  if (type === "overdue") return T.notify.actionOverdue;
  if (type === "due_today") return T.notify.actionDueToday;
  if (type === "deadline_approaching") return T.notify.actionDeadline;
  if (type === "action_required") return T.notify.actionGeneric;
  return null;
}

export function userMustAct(item: AppNotification, role: Role): boolean {
  if (!notifyMeta(item.type).actionable) return false;
  if (item.status) return isWaitingOn(item.status, role);
  return (
    item.type === "response_needed" ||
    item.type === "action_required" ||
    item.type === "returned" ||
    item.type === "overdue" ||
    item.type === "due_today" ||
    item.type === "deadline_approaching"
  );
}

export function whyItArrived(item: AppNotification): string {
  const T = currentT();
  switch (item.type) {
    case "overdue":
      return T.notify.whyOverdue;
    case "due_today":
      return T.notify.whyDueToday;
    case "deadline_approaching":
      return T.notify.whyDeadline;
    case "response_needed":
      return T.notify.whyResponse;
    case "returned":
      return T.notify.whyReturned;
    case "action_required":
      return T.notify.whyAction;
    case "status_change":
      return T.notify.whyStatus;
    default:
      return item.message;
  }
}

export function daysOverdueLabel(item: AppNotification): string | null {
  if (!item.overdue || !item.target_date) return null;
  const target = new Date(item.target_date);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days <= 0) return null;
  const T = currentT();
  if (days === 1) return T.notify.overdueSinceOne;
  if (days === 2) return T.notify.overdueSinceTwo;
  return T.notify.overdueSince.replace("{n}", String(days));
}

export function sortNotifications(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => {
    const aOverdue = a.type === "overdue" || a.overdue ? 0 : 1;
    const bOverdue = b.type === "overdue" || b.overdue ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const pa = notifyMeta(a.type).priority;
    const pb = notifyMeta(b.type).priority;
    if (pa !== pb) return pa - pb;
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
    return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
  });
}

export type NotifyFilter = "all" | "unread" | "action" | "overdue" | "deadline" | "returned" | "status" | "linked" | "older";

export function filterNotifications(
  items: AppNotification[],
  filter: NotifyFilter,
  query: string
): AppNotification[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "unread" && item.is_read) return false;
    if (filter === "action" && !notifyMeta(item.type).actionable) return false;
    if (filter === "overdue" && item.type !== "overdue" && !item.overdue) return false;
    if (filter === "deadline" && item.type !== "deadline_approaching" && item.type !== "due_today") return false;
    if (filter === "returned" && item.type !== "returned") return false;
    if (filter === "status" && item.type !== "status_change") return false;
    if (filter === "linked" && !item.recommendation) return false;
    if (filter === "older") {
      const age = Date.now() - new Date(item.sent_at).getTime();
      if (Number.isNaN(age) || age < 7 * 86_400_000) return false;
    }
    if (!q) return true;
    const recId = item.recommendation ? recordCode(item.recommendation).toLowerCase() : "";
    const hay = [
      item.message,
      item.recommendation_text ?? "",
      item.department_name ?? "",
      item.responsible_employee ?? "",
      item.report_title ?? "",
      recId,
      String(item.recommendation ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export type NotifyGroupId = "action" | "overdue" | "deadline" | "returned" | "status";

export function groupForAction(items: AppNotification[]): Array<{
  id: NotifyGroupId;
  label: string;
  items: AppNotification[];
}> {
  const buckets: Record<NotifyGroupId, AppNotification[]> = {
    overdue: [],
    action: [],
    returned: [],
    deadline: [],
    status: [],
  };
  for (const item of items) {
    const category = notifyMeta(item.type).category;
    if (category === "overdue" || item.overdue) buckets.overdue.push(item);
    else if (category === "due" || category === "deadline") buckets.deadline.push(item);
    else if (category === "returned") buckets.returned.push(item);
    else if (category === "status") buckets.status.push(item);
    else buckets.action.push(item);
  }
  const T = currentT();
  const order: Array<{ id: NotifyGroupId; label: string }> = [
    { id: "overdue", label: T.notify.groupOverdue },
    { id: "action", label: T.notify.groupAction },
    { id: "returned", label: T.notify.groupReturned },
    { id: "deadline", label: T.notify.groupDeadline },
    { id: "status", label: T.notify.groupStatus },
  ];
  return order
    .map((group) => ({ ...group, items: buckets[group.id] }))
    .filter((group) => group.items.length);
}

export function currentStageLabel(item: AppNotification): string | null {
  if (!item.status) return null;
  return stageForStatus(item.status).label;
}

export function nextPathFromUrl(next: string | null | undefined): string | null {
  if (!next) return null;
  try {
    const url = new URL(next);
    return `${url.pathname}${url.search}`;
  } catch {
    return next.startsWith("/") ? next : null;
  }
}
