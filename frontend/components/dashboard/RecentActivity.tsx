"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Bell, CalendarClock, Undo2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DirForward } from "@/components/i18n/DirIcon";

import { CardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_TYPE_LABELS, T, useI18n } from "@/lib/i18n";
import type { AppNotification, Paginated } from "@/lib/types";

/**
 * The backend exposes the audit trail only inside a single recommendation, so
 * there is no cross-case activity feed to read. Notifications are the one real
 * chronological stream scoped to the signed-in user, and the heading says so
 * rather than passing this off as the full audit trail.
 */
const MARKER: Record<string, { icon: ReactNode; ring: string }> = {
  overdue: { icon: <AlertTriangle className="size-3.5" />, ring: "bg-danger-light text-danger-dark" },
  returned: { icon: <Undo2 className="size-3.5" />, ring: "bg-danger-light text-danger-dark" },
  action_required: { icon: <Bell className="size-3.5" />, ring: "bg-warning-light text-warning-dark" },
  response_needed: { icon: <Bell className="size-3.5" />, ring: "bg-warning-light text-warning-dark" },
  deadline_approaching: { icon: <CalendarClock className="size-3.5" />, ring: "bg-info-light text-info-dark" },
  due_today: { icon: <CalendarClock className="size-3.5" />, ring: "bg-info-light text-info-dark" },
  status_change: { icon: <ArrowLeftRight className="size-3.5" />, ring: "bg-subtle text-ink-soft" },
};

const FALLBACK = { icon: <Bell className="size-3.5" />, ring: "bg-subtle text-ink-soft" };

export function RecentActivity({
  detailBase,
  limit = 8,
  compact = false,
}: {
  detailBase: string;
  limit?: number;
  compact?: boolean;
}) {
  useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => api<Paginated<AppNotification>>("/api/notifications/?page_size=25"),
    staleTime: 30_000,
  });

  if (isLoading) return <CardSkeleton />;
  if (isError) return null;

  const items = (data?.results ?? [])
    .slice()
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
    .slice(0, limit);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface">
      <header className="border-b border-line px-4 py-2.5">
        <h2 className="font-heading text-base font-semibold text-ink">{T.analytics.activity}</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">{T.analytics.activityHint}</p>
      </header>

      {items.length ? (
        <ol className="px-4 py-3">
          {items.map((item, index) => {
            const marker = MARKER[item.type] ?? FALLBACK;
            const last = index === items.length - 1;

            return (
              <li key={item.id} className={cn("relative flex gap-3 last:pb-0", compact ? "pb-3" : "pb-4")}>
                {last ? null : (
                  <span aria-hidden className="absolute top-7 bottom-0 start-[0.6875rem] w-px bg-line" />
                )}

                <span
                  className={cn(
                    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full",
                    marker.ring
                  )}
                >
                  {marker.icon}
                </span>

                <div className={cn("min-w-0 flex-1", item.is_read && "opacity-70")}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[11.5px] font-medium text-ink-soft">
                      {NOTIFICATION_TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <time className="font-mono text-[10.5px] text-muted" dir="ltr">
                      {formatDateTime(item.sent_at)}
                    </time>
                  </div>

                  <p className={cn("mt-0.5 text-[13px] leading-snug text-ink", compact && "line-clamp-2", !item.is_read && "font-medium")}>
                    {item.message}
                  </p>

                  {item.recommendation ? (
                    <Link
                      href={`${detailBase}/${item.recommendation}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-primary-dark hover:underline"
                    >
                      {item.recommendation_text
                        ? caseTitle(item.recommendation_text, 70)
                        : T.analytics.openCase}
                      <DirForward className="size-3" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact title={T.analytics.activityEmpty} className="border-0" />
      )}
    </section>
  );
}
