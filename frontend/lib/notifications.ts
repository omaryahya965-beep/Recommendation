import { caseTitle } from "./finding";
import { dayCount, formatDate, plural, recordCode } from "./format";
import { DECISION_LABELS } from "./i18n";
import { currentT } from "./i18n/messages";
import type { AppNotification, NotificationType, RecommendationStatus, Role } from "./types";
import { isWaitingOn, stageForStatus, STATUS_NEXT_ACTION } from "./workflow";
import { caseHref, sectionForStatus } from "./caseLinks";
import type { SectionId } from "./viewmodels/caseView";

/**
 * Backend `Notification.type` values. Workflow emits `status_change` for
 * informational updates (accepted, sent to council, closed) that do not
 * require the recipient to act.
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

/** The notifications inbox of each role. */
export function notificationsCenter(role: Role): string {
  return `/${role === "department_head" ? "department" : role}/notifications`;
}

export function recBase(role: Role): string {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/my-tasks";
  return "/council/recommendations";
}

/**
 * The case section a notification leads to: where the case's work is now
 * (response, plan, evidence, verification, decisions), from its current
 * status, so an old notification still opens the part that matters today.
 */
export function notificationSection(item: AppNotification): SectionId | null {
  if (!item.recommendation) return null;
  return sectionForStatus(item.status) ?? (item.type === "response_needed" ? "finding" : null);
}

/**
 * Where a notification leads: the case at its section, or the report.
 * Department heads, employees and the Council have no report page, so a
 * report event opens their register filtered to that report (the Council's
 * ratification requests open its approvals queue).
 */
export function notificationHref(item: AppNotification, role: Role): string {
  if (item.recommendation) {
    return caseHref(recBase(role), item.recommendation, notificationSection(item));
  }
  if (item.report) {
    if (role === "audit") return `/audit/reports/${item.report}`;
    if (role === "council" && item.type === "action_required") return "/council/pending-approvals";
    return `${recBase(role)}?report=${item.report}`;
  }
  if (role === "council") return "/council/pending-approvals";
  if (role === "department_head") return "/department/recommendations";
  if (role === "audit") return "/audit/reports";
  return recBase(role);
}

/** The destination in words ("يفتح على: خطة العمل"), for the open button's hint. */
export function notificationTarget(item: AppNotification): { kind: "case" | "report" | "list"; section: SectionId | null } {
  if (item.recommendation) return { kind: "case", section: notificationSection(item) };
  if (item.report) return { kind: "report", section: null };
  return { kind: "list", section: null };
}

export function notificationTitle(item: AppNotification): string {
  const T = currentT();
  if (item.recommendation) {
    return caseTitle(item.recommendation_text ?? "", 90) || recordCode(item.recommendation);
  }
  return item.report_title || notificationText(item).split(":")[0] || T.notify.title;
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

/** "Overdue for 3 days" — the server's count from the binding deadline (W1/W2). */
export function daysOverdueLabel(item: AppNotification): string | null {
  const days = item.overdue ? (item.days_overdue ?? 0) : 0;
  if (days <= 0) return null;
  return currentT().notify.overdueSince.replace("{days}", dayCount(days, "genitive"));
}

export type ReadFilter = "all" | "unread" | "read";

/** The inbox filters: read state, one notification type, and free text. */
export function filterNotifications(
  items: AppNotification[],
  read: ReadFilter,
  type: NotificationType | "all",
  query: string
): AppNotification[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (read === "unread" && item.is_read) return false;
    if (read === "read" && !item.is_read) return false;
    if (type !== "all" && item.type !== type) return false;
    if (!q) return true;
    const recId = item.recommendation ? recordCode(item.recommendation).toLowerCase() : "";
    const hay = [
      item.message,
      notificationText(item),
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

export type NotifyTimeGroup = "today" | "week" | "older";

/** Today · this week · older, by the local calendar day the notification arrived. */
export function timeGroupOf(item: AppNotification, now: Date = new Date()): NotifyTimeGroup {
  const sent = new Date(item.sent_at);
  if (Number.isNaN(sent.getTime())) return "older";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (sent.getTime() >= startOfToday) return "today";
  return sent.getTime() >= startOfToday - 6 * 86_400_000 ? "week" : "older";
}

/** Newest first, grouped by when they arrived (empty groups dropped). */
export function groupByTime(
  items: AppNotification[],
  now: Date = new Date()
): Array<{ id: NotifyTimeGroup; label: string; items: AppNotification[] }> {
  const T = currentT();
  const sorted = [...items].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime() || b.id - a.id);
  const labels: Record<NotifyTimeGroup, string> = { today: T.notify.today, week: T.notify.thisWeek, older: T.notify.earlier };
  return (["today", "week", "older"] as const)
    .map((id) => ({ id, label: labels[id], items: sorted.filter((item) => timeGroupOf(item, now) === id) }))
    .filter((group) => group.items.length);
}

/**
 * The notification's text in the reader's language (BUG-16). The server
 * stores a message key and parameters; rows from before that have only the
 * Arabic text the server wrote, which is shown as it is.
 */
export function notificationText(item: AppNotification): string {
  const T = currentT();
  const key = item.message_key;
  const params = item.message_params ?? {};
  const templates = T.notify.messages as unknown as Record<string, unknown>;
  const template = key ? templates[key] : undefined;
  if (typeof template !== "string") return item.message;
  const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) values[name] = text(value);
  if (typeof params.count === "number") values.recs = plural(params.count, T.notify.messages.recs);
  if (key === "report_sent_to_department") {
    values.deadline = params.deadline ? T.notify.messages.report_sent_deadline.replace("{date}", formatDate(text(params.deadline))) : "";
  } else if (typeof params.deadline === "string" && params.deadline) {
    values.deadline = formatDate(params.deadline);
  }
  if (key === "verification_returned" && typeof params.decision === "string") {
    values.decision = (DECISION_LABELS as Record<string, string>)[params.decision] ?? params.decision;
  }
  if (key === "reminder") {
    const days = Number(params.days);
    const what = T.notify.messages.reminderWhat[params.anchor as "plan" | "verification" | "response"] ?? "";
    const base = days < 0 ? T.notify.messages.reminderBefore : days === 0 ? T.notify.messages.reminderToday : T.notify.messages.reminderAfter;
    return base
      .replace("{days}", plural(Math.abs(days), T.notify.messages.days))
      .replace("{what}", what)
      .replace("{deadline}", values.deadline ?? "")
      .replace("{title}", values.title ?? "")
      .replace("{ref}", values.ref ?? "");
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
