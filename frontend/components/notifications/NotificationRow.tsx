"use client";

import Link from "next/link";
import { ArrowUpRight, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatDateTime, recordCode, relativeTimeAr } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import {
  currentStageLabel,
  daysOverdueLabel,
  notificationHref,
  notificationTitle,
  notifyMeta,
  requiredAction,
  userMustAct,
} from "@/lib/notifications";
import type { AppNotification, Role } from "@/lib/types";
import { RiskBadge } from "@/components/ui/RiskBadge";

const TONE: Record<string, string> = {
  danger: "text-danger-dark",
  warning: "text-warning-dark",
  primary: "text-primary-dark",
  info: "text-info-dark",
  neutral: "text-muted",
};

const TONE_BG: Record<string, string> = {
  danger: "bg-danger/8",
  warning: "bg-warning/8",
  primary: "bg-primary/8",
  info: "bg-info/8",
  neutral: "bg-subtle",
};

export function NotificationRow({
  item,
  role,
  selected,
  onSelect,
  onRemove,
}: {
  item: AppNotification;
  role: Role;
  selected?: boolean;
  onSelect?: (item: AppNotification) => void;
  onRemove?: (item: AppNotification) => void;
}) {
  useI18n();
  const meta = notifyMeta(item.type);
  const action = requiredAction(item, role);
  const mustAct = userMustAct(item, role);
  const stage = currentStageLabel(item);
  const overdueLabel = daysOverdueLabel(item);
  const href = notificationHref(item, role);

  return (
    <article
      className={cn(
        "border-b border-line px-4 py-4 transition-colors last:border-0",
        !item.is_read && "bg-subtle/50",
        selected && "bg-primary/5 border-s-2 border-s-primary",
        "hover:bg-subtle/80"
      )}
    >
      <button type="button" className="w-full text-start" onClick={() => onSelect?.(item)}>
        {/* Type label + timestamp */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            TONE_BG[meta.tone],
            TONE[meta.tone]
          )}>
            <span aria-hidden>{meta.marker}</span>
            {meta.label}
            {!item.is_read ? (
              <span className="size-1.5 rounded-full bg-primary" aria-label={T.notify.unread} />
            ) : null}
          </span>
          <time
            className="font-mono text-[11px] font-medium text-muted"
            dateTime={item.sent_at}
            title={formatDateTime(item.sent_at)}
          >
            {relativeTimeAr(item.sent_at)}
          </time>
        </div>

        {/* Message */}
        <p className={cn("text-[14px] leading-snug text-ink", !item.is_read && "font-bold")}>
          {item.message}
        </p>

        {/* Record / report reference */}
        {item.recommendation ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <span className="font-mono font-bold text-navy" dir="ltr">
              {recordCode(item.recommendation)}
            </span>
            <span className="text-muted/50">·</span>
            <span className="font-medium">{notificationTitle(item)}</span>
          </p>
        ) : item.report_title ? (
          <p className="mt-1.5 text-[12.5px] font-medium text-ink-soft">{item.report_title}</p>
        ) : null}

        {/* Meta chips */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.department_name ? (
            <span className="rounded-full bg-subtle border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
              {item.department_name}
            </span>
          ) : null}
          {stage ? (
            <span className="rounded-full bg-subtle border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
              {stage}
            </span>
          ) : null}
          {item.risk_level ? <RiskBadge level={item.risk_level} /> : null}
          {overdueLabel ? (
            <span className="rounded-full bg-danger/8 border border-danger/20 px-2 py-0.5 text-[11px] font-bold text-danger-dark">
              {overdueLabel}
            </span>
          ) : null}
        </div>

        {/* Required action */}
        {mustAct && action ? (
          <p className="mt-2 rounded-lg bg-navy/5 px-3 py-2 text-[12.5px] font-semibold text-navy border border-navy/10">
            <span className="font-bold">{T.notify.requiredAction}:</span> {action}
          </p>
        ) : null}
      </button>

      {/* Footer actions */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={href}
          onClick={() => onSelect?.(item)}
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary-dark hover:underline"
        >
          {item.recommendation ? T.notify.openCase : T.notify.open}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-danger-dark"
          >
            <Trash2 className="size-3" aria-hidden />
            {T.notify.remove}
          </button>
        ) : null}
      </div>
    </article>
  );
}
