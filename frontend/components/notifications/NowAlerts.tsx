"use client";

import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";

import { CardSkeleton } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/Base";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { formatDate, formatDateTime, recordCode, relativeTimeAr } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { useMarkNotificationRead, useNotifications } from "@/lib/hooks";
import {
  currentStageLabel,
  daysOverdueLabel,
  notificationHref,
  notificationTitle,
  notificationsCenter,
  notifyMeta,
  requiredAction,
  sortNotifications,
  userMustAct,
} from "@/lib/notifications";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/cn";

function centerHref(role: Role) {
  return notificationsCenter(role);
}

/**
 * Compact dashboard strip: highest-priority actionable notifications.
 * Not a second inbox — the full center is one click away.
 */
export function NowAlerts({ role, limit = 6 }: { role: Role; limit?: number }) {
  useI18n();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();

  if (isLoading) return <CardSkeleton className="h-28" />;
  if (isError) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const items = sortNotifications(data?.results ?? [])
    .filter((item) => notifyMeta(item.type).actionable)
    .slice(0, limit);

  return (
    <section className="overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <h2 className="font-heading text-base font-semibold text-ink">{T.notify.nowTitle}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">{T.notify.nowHint}</p>
        </div>
        <Link href={centerHref(role)} className="text-sm font-medium text-primary-dark hover:underline">
          {T.notify.viewAll}
        </Link>
      </header>

      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const meta = notifyMeta(item.type);
            const action = requiredAction(item, role);
            const mustAct = userMustAct(item, role);
            const overdueLabel = daysOverdueLabel(item);
            const stage = currentStageLabel(item);
            return (
              <li key={item.id} className={cn("px-4 py-3", !item.is_read && "bg-subtle/40")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[12px] font-semibold",
                        meta.tone === "danger"
                          ? "text-danger-dark"
                          : meta.tone === "warning"
                            ? "text-warning-dark"
                            : "text-primary-dark"
                      )}
                    >
                      {meta.marker} {meta.label}
                    </p>
                    {item.recommendation ? (
                      <p className="mt-1 text-[14px] font-medium text-ink">
                        <span className="font-mono text-navy" dir="ltr">
                          {recordCode(item.recommendation)}
                        </span>
                        <span className="mx-1.5 text-muted">·</span>
                        {notificationTitle(item)}
                      </p>
                    ) : (
                      <p className="mt-1 text-[14px] font-medium text-ink">{item.message}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                      {mustAct && action ? (
                        <span className="text-navy">
                          {T.notify.requiredAction}: {action}
                        </span>
                      ) : null}
                      {item.target_date ? (
                        <span dir="ltr">
                          {T.notify.deadlineLabel} {formatDate(item.target_date)}
                        </span>
                      ) : null}
                      {item.risk_level ? <RiskBadge level={item.risk_level} /> : null}
                      {stage ? <span>{stage}</span> : null}
                      {overdueLabel ? <span className="text-danger-dark">{overdueLabel}</span> : null}
                      <time dateTime={item.sent_at} title={formatDateTime(item.sent_at)}>
                        {relativeTimeAr(item.sent_at)}
                      </time>
                    </p>
                  </div>
                  <Link
                    href={notificationHref(item, role)}
                    onClick={() => {
                      if (!item.is_read) markRead.mutate(item.id);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary-dark hover:underline"
                  >
                    {T.notify.open}
                    <DirForward className="size-3.5" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-5 text-center text-sm text-ink-soft">{T.notify.emptyActionHint}</p>
      )}
    </section>
  );
}
