"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  Check,
  FileText,
  MessageSquareReply,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { sectionLabel } from "@/lib/caseLinks";
import { cn } from "@/lib/cn";
import { formatDateTime, recordCode, relativeTime } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import {
  daysOverdueLabel,
  notificationHref,
  notificationTarget,
  notificationTitle,
  notifyMeta,
  requiredAction,
  userMustAct,
} from "@/lib/notifications";
import { useMarkNotificationRead } from "@/lib/hooks";
import type { AppNotification, Role } from "@/lib/types";

const ICON: Record<string, LucideIcon> = {
  overdue: AlertTriangle,
  returned: Undo2,
  due_today: CalendarClock,
  deadline_approaching: CalendarClock,
  response_needed: MessageSquareReply,
  action_required: BellRing,
  status_change: ArrowLeftRight,
};

const TONE: Record<string, string> = {
  danger: "bg-danger-light text-danger-dark",
  warning: "bg-warning-light text-warning-dark",
  primary: "bg-primary-light text-primary-dark",
  info: "bg-info-light text-info-dark",
  neutral: "bg-subtle text-ink-soft",
};

const LABEL_TONE: Record<string, string> = {
  danger: "text-danger-dark",
  warning: "text-warning-dark",
  primary: "text-primary-dark",
  info: "text-info-dark",
  neutral: "text-muted",
};

/** "يفتح على: خطة العمل" — where the click lands. */
export function targetLabel(item: AppNotification): string {
  const target = notificationTarget(item);
  if (target.kind === "report") return T.notify.openReport;
  if (target.kind === "case" && target.section) return T.notify.opensAt.replace("{section}", sectionLabel(target.section));
  return item.recommendation ? T.notify.openCase : T.notify.open;
}

/**
 * One notification. The whole row opens its target (the case at the right
 * section, or the report) and marks it read; page-only actions (mark read,
 * remove) sit beside the link, never inside it.
 */
export function NotificationItem({
  item,
  role,
  onNavigate,
  onRemove,
  showActions = false,
  dense = false,
}: {
  item: AppNotification;
  role: Role;
  /** Called after the click marks it read (the bell closes itself here). */
  onNavigate?: () => void;
  onRemove?: (item: AppNotification) => void;
  showActions?: boolean;
  dense?: boolean;
}) {
  useI18n();
  const markRead = useMarkNotificationRead();
  const meta = notifyMeta(item.type);
  const Icon = item.recommendation || !item.report ? (ICON[item.type] ?? BellRing) : FileText;
  const mustAct = userMustAct(item, role);
  const action = mustAct ? requiredAction(item, role) : null;
  const overdue = daysOverdueLabel(item);
  const unread = !item.is_read;

  return (
    <article
      className={cn(
        "group relative flex min-w-0 gap-1 transition-colors",
        unread ? "bg-primary-light/35 hover:bg-primary-light/55" : "hover:bg-subtle/60"
      )}
      data-testid="notification-item"
      data-id={item.id}
      data-read={item.is_read ? "true" : "false"}
    >
      {unread ? <span className="absolute inset-y-0 start-0 w-[3px] bg-primary" aria-hidden /> : null}
      <Link
        href={notificationHref(item, role)}
        onClick={() => {
          if (unread) markRead.mutate(item.id);
          onNavigate?.();
        }}
        className={cn(
          "flex min-w-0 flex-1 gap-3 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          dense ? "px-4 py-3" : "px-4 py-3.5 md:px-5"
        )}
      >
        <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", TONE[meta.tone])} aria-hidden>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className={cn("inline-flex min-w-0 items-center gap-1.5 truncate text-[12px] font-bold", LABEL_TONE[meta.tone])}>
              {meta.label}
              {unread ? (
                <>
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="sr-only">{T.notify.unread}</span>
                </>
              ) : null}
            </span>
            <time
              className="shrink-0 text-[11.5px] font-medium text-muted"
              dateTime={item.sent_at}
              title={formatDateTime(item.sent_at)}
            >
              {relativeTime(item.sent_at)}
            </time>
          </span>
          <span
            className={cn(
              "mt-1 block text-[13.5px] leading-snug text-ink",
              dense && "line-clamp-2",
              unread ? "font-bold" : "font-medium"
            )}
          >
            <bdi>{item.message}</bdi>
          </span>
          {item.recommendation ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-soft">
              <span className="shrink-0 font-mono font-bold text-navy" dir="ltr">
                {recordCode(item.recommendation)}
              </span>
              <span className="truncate">
                <bdi>{notificationTitle(item)}</bdi>
              </span>
            </span>
          ) : item.report_title ? (
            <span className="mt-1 block truncate text-[12px] text-ink-soft">
              <bdi>{item.report_title}</bdi>
            </span>
          ) : null}
          {!dense && (action || overdue || item.department_name) ? (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {action ? (
                <span className="max-w-full truncate rounded-full bg-navy/5 px-2 py-0.5 text-[11.5px] font-bold text-navy ring-1 ring-navy/10">
                  {T.notify.requiredAction}: {action}
                </span>
              ) : null}
              {overdue ? (
                <span className="rounded-full bg-danger-light px-2 py-0.5 text-[11.5px] font-bold text-danger-dark">{overdue}</span>
              ) : null}
              {item.department_name ? (
                <span className="max-w-full truncate rounded-full bg-subtle px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft">{item.department_name}</span>
              ) : null}
            </span>
          ) : null}
          <span className="mt-1.5 block text-[11.5px] font-bold text-primary-dark" data-testid="notification-target">
            {targetLabel(item)}
          </span>
        </span>
      </Link>
      {showActions ? (
        <span className="flex shrink-0 flex-col items-center justify-start gap-1 py-2.5 pe-2">
          {unread ? (
            <button
              type="button"
              onClick={() => markRead.mutate(item.id)}
              className="flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-primary-dark"
              aria-label={T.notify.markRead}
              title={T.notify.markRead}
            >
              <Check className="size-4" aria-hidden />
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-danger-dark"
              aria-label={T.notify.remove}
              title={T.notify.remove}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          ) : null}
        </span>
      ) : null}
    </article>
  );
}
