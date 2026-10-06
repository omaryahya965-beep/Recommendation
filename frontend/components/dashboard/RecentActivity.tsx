"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import Link from "next/link";

import { NotificationItem } from "@/components/notifications/NotificationItem";
import { CardSkeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import { notificationsCenter } from "@/lib/notifications";
import type { AppNotification, Paginated, Role } from "@/lib/types";

/**
 * The latest notifications on a home page, newest first. Each opens its exact
 * target (the case at the right section, or the report) and is marked read.
 */
export function RecentActivity({
  role,
  limit = 4,
  compact = false,
}: {
  role: Role;
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
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime() || b.id - a.id)
    .slice(0, limit);

  return (
    <section
      className="section-elevated flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface"
      data-testid="recent-activity"
    >
      <header className="flex items-start gap-3 border-b border-line/70 px-4 py-3.5 md:px-6 md:py-4">
        <div className="mt-1 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-heading text-[16.5px] font-bold text-navy md:text-[17px]">{T.analytics.activity}</h2>
          <p className="mt-1 text-[12.5px] text-muted md:text-[13px]">{T.analytics.activityHint}</p>
        </div>
      </header>

      {items.length ? (
        <>
          <ul className="divide-y divide-line/60">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} role={role} dense={compact} />
              </li>
            ))}
          </ul>
          <footer className="mt-auto border-t border-line/70 bg-subtle/40">
            <Link
              href={notificationsCenter(role)}
              className="flex min-h-12 items-center justify-center gap-1.5 text-[13.5px] font-bold text-primary-dark transition-colors hover:bg-primary-light/40 hover:text-primary"
            >
              {T.notify.viewAll}
              <DirForward className="size-4" aria-hidden />
            </Link>
          </footer>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-subtle text-muted">
            <History className="size-5" aria-hidden />
          </span>
          <p className="text-[13.5px] font-semibold text-ink-soft">{T.analytics.activityEmpty}</p>
        </div>
      )}
    </section>
  );
}
