"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Bell, CalendarClock, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_TYPE_LABELS, T, useI18n } from "@/lib/i18n";
import type { AppNotification, Paginated } from "@/lib/types";

const MARKER: Record<string, { icon: ReactNode; ring: string }> = {
  overdue: { icon: <AlertTriangle className="size-4" />, ring: "bg-danger-light text-danger-dark ring-danger/20" },
  returned: { icon: <Undo2 className="size-4" />, ring: "bg-danger-light text-danger-dark ring-danger/20" },
  action_required: { icon: <Bell className="size-4" />, ring: "bg-warning-light text-warning-dark ring-warning/20" },
  response_needed: { icon: <Bell className="size-4" />, ring: "bg-warning-light text-warning-dark ring-warning/20" },
  deadline_approaching: { icon: <CalendarClock className="size-4" />, ring: "bg-info-light text-info-dark ring-info/20" },
  due_today: { icon: <CalendarClock className="size-4" />, ring: "bg-info-light text-info-dark ring-info/20" },
  status_change: { icon: <ArrowLeftRight className="size-4" />, ring: "bg-subtle text-ink-soft ring-line" },
};

const FALLBACK = { icon: <Bell className="size-4" />, ring: "bg-subtle text-ink-soft ring-line" };

export function RecentActivity({
  detailBase,
  limit = 8,
  compact = false,
}: {
  detailBase: string;
  limit?: number;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => api<Paginated<AppNotification>>("/api/notifications/?page_size=25"),
    staleTime: 30_000,
  });

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  if (isLoading) return <CardSkeleton />;
  if (isError) return null;

  const items = (data?.results ?? [])
    .slice()
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
    .slice(0, limit);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
      <header className="border-b border-line px-5 py-4 flex items-center gap-3">
        <div className="h-4 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
        <div>
          <h2 className="font-heading text-[16px] font-bold text-navy">{T.analytics.activity}</h2>
          <p className="mt-1 text-[13px] text-ink-soft">{T.analytics.activityHint}</p>
        </div>
      </header>

      {items.length ? (
        <ol className={cn("px-5 py-4", compact ? "" : "space-y-1")}>
          {items.map((item, index) => {
            const marker = MARKER[item.type] ?? FALLBACK;
            const last = index === items.length - 1;

            return (
              <li key={item.id} className={cn("group relative flex gap-4 transition-all duration-200 rounded-xl", compact ? "pb-4" : "p-3 hover:bg-subtle/50", !item.is_read && !compact && "bg-primary-light/10")}>
                {compact && !last ? (
                  <span aria-hidden className="absolute top-8 bottom-0 start-[0.875rem] w-px bg-line/80" />
                ) : null}

                <span
                  className={cn(
                    "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-2 shadow-sm transition-transform duration-200 group-hover:scale-110",
                    marker.ring
                  )}
                >
                  {marker.icon}
                </span>

                <div className={cn("min-w-0 flex-1", item.is_read && "opacity-80")}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      {NOTIFICATION_TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <time className="font-mono text-[11px] font-medium text-muted/80" dir="ltr">
                      {formatDateTime(item.sent_at)}
                    </time>
                  </div>

                  <p className={cn("mt-1.5 text-[14px] leading-relaxed text-ink", compact && "line-clamp-2", !item.is_read && "font-semibold")}>
                    {item.message}
                  </p>

                  {item.recommendation ? (
                    <Link
                      href={`${detailBase}/${item.recommendation}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary-dark hover:text-primary transition-colors"
                    >
                      {item.recommendation_text
                        ? caseTitle(item.recommendation_text, 70)
                        : T.analytics.openCase}
                      <DirForward className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact title={T.analytics.activityEmpty} className="border-0 shadow-none py-10" />
      )}
    </section>
  );
}
