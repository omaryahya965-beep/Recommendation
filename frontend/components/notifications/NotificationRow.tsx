"use client";

import Link from "next/link";

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
        "border-b border-line px-4 py-3.5 transition-colors",
        !item.is_read && "bg-subtle/50",
        selected && "bg-primary-light/60",
        "hover:bg-subtle/80"
      )}
    >
      <button type="button" className="w-full text-start" onClick={() => onSelect?.(item)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", TONE[meta.tone])}>
            <span aria-hidden>{meta.marker}</span>
            {meta.label}
            {!item.is_read ? (
              <span className="size-1.5 rounded-full bg-primary" aria-label={T.notify.unread} />
            ) : null}
          </p>
          <time
            className="font-mono text-[11px] text-muted"
            dateTime={item.sent_at}
            title={formatDateTime(item.sent_at)}
          >
            {relativeTimeAr(item.sent_at)}
          </time>
        </div>

        <p className={cn("mt-1.5 text-[14px] leading-snug text-ink", !item.is_read && "font-semibold")}>
          {item.message}
        </p>

        {item.recommendation ? (
          <p className="mt-1.5 text-[13px] text-ink-soft">
            <span className="font-mono text-navy" dir="ltr">
              {recordCode(item.recommendation)}
            </span>
            <span className="mx-1.5 text-muted">·</span>
            {notificationTitle(item)}
          </p>
        ) : item.report_title ? (
          <p className="mt-1.5 text-[13px] text-ink-soft">{item.report_title}</p>
        ) : null}

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {item.department_name ? <span>{item.department_name}</span> : null}
          {stage ? <span>{stage}</span> : null}
          {item.risk_level ? <RiskBadge level={item.risk_level} /> : null}
          {overdueLabel ? <span className="font-medium text-danger-dark">{overdueLabel}</span> : null}
        </p>

        {mustAct && action ? (
          <p className="mt-2 text-[13px] text-navy">
            <span className="font-medium">{T.notify.requiredAction}: </span>
            {action}
          </p>
        ) : null}
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href={href}
          onClick={() => onSelect?.(item)}
          className="inline-flex text-[13px] font-medium text-primary-dark hover:underline"
        >
          {item.recommendation ? T.notify.openCase : T.notify.open}
        </Link>
        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="text-[13px] text-muted hover:text-danger-dark"
          >
            {T.notify.remove}
          </button>
        ) : null}
      </div>
    </article>
  );
}
