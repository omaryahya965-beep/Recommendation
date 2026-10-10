"use client";

import { BellOff, CheckCheck, Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Button, ErrorBanner, Select, TextInput } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { useDeleteNotification, useMarkAllNotificationsRead, useNotifications } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import {
  filterNotifications,
  groupByTime,
  nextPathFromUrl,
  notifyMeta,
  type ReadFilter,
} from "@/lib/notifications";
import type { AppNotification, NotificationType, Paginated, Role } from "@/lib/types";

const TYPES: NotificationType[] = [
  "overdue",
  "returned",
  "due_today",
  "deadline_approaching",
  "response_needed",
  "action_required",
  "status_change",
];

function InboxSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-11 w-full max-w-md rounded-full" />
      <div className="overflow-hidden rounded-2xl border border-line">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex gap-3 border-b border-line px-4 py-4 last:border-0">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-4 w-4/5 rounded-lg" />
              <Skeleton className="h-3 w-2/5 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The notifications inbox: every notification, newest first and grouped by
 * day, filtered by read state and type. Each one opens its exact target and
 * is marked read on the way.
 */
export function NotificationCenter({ role }: { role: Role }) {
  useI18n();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const removeNote = useDeleteNotification();
  const [read, setRead] = useState<ReadFilter>("all");
  const [type, setType] = useState<NotificationType | "all">("all");
  const [query, setQuery] = useState("");
  const [pendingRemove, setPendingRemove] = useState<AppNotification | null>(null);
  const [extra, setExtra] = useState<AppNotification[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = useMemo(() => {
    const pageItems = data?.results ?? [];
    const fresh = new Map(pageItems.map((item) => [item.id, item]));
    // Older pages keep their rows; the first page is the live copy.
    return [...pageItems, ...extra.filter((item) => !fresh.has(item.id))];
  }, [data?.results, extra]);

  const unread = items.filter((item) => !item.is_read).length;
  const counts: Record<ReadFilter, number> = { all: items.length, unread, read: items.length - unread };
  const present = TYPES.filter((id) => items.some((item) => item.type === id));
  const visible = useMemo(() => filterNotifications(items, read, type, query), [items, read, type, query]);
  const groups = useMemo(() => groupByTime(visible), [visible]);
  const moreHref = extra.length === 0 ? nextPathFromUrl(data?.next ?? null) : nextPage;

  const filtered = type !== "all" || query.trim() !== "";
  const empty =
    read === "unread"
      ? { title: T.notify.emptyUnread, hint: T.notify.emptyUnreadHint }
      : read === "read"
        ? { title: T.notify.emptyRead, hint: T.notify.emptyReadHint }
        : filtered
          ? { title: T.notify.emptyFilter, hint: undefined }
          : { title: T.notify.empty, hint: T.notify.emptyHint };

  async function loadMore() {
    if (!moreHref || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<Paginated<AppNotification>>(moreHref);
      setExtra((current) => {
        const seen = new Set([...(data?.results ?? []), ...current].map((item) => item.id));
        return [...current, ...page.results.filter((item) => !seen.has(item.id))];
      });
      setNextPage(nextPathFromUrl(page.next));
    } finally {
      setLoadingMore(false);
    }
  }

  const markAllButton =
    unread > 0 ? (
      <Button variant="secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending} className="gap-2 font-bold">
        <CheckCheck className="size-4" aria-hidden />
        {T.notify.markAllRead}
      </Button>
    ) : null;

  return (
    <div className="space-y-4" data-testid="notification-center">
      <PageHeader title={T.notify.title} description={T.notify.subtitle} actions={markAllButton ? <span className="max-md:hidden">{markAllButton}</span> : undefined} />

      {isLoading ? (
        <InboxSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-sm md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid w-full grid-cols-3 gap-1 rounded-full bg-subtle p-1 sm:w-auto" role="group" aria-label={T.notify.title}>
                {(["all", "unread", "read"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={read === id}
                    onClick={() => setRead(id)}
                    data-filter={id}
                    className={cn(
                      "inline-flex min-h-10 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-[12.5px] font-bold transition-colors sm:gap-1.5 sm:px-3.5 sm:text-[13px]",
                      read === id ? "bg-surface text-navy shadow-sm" : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {id === "all" ? T.notify.all : id === "unread" ? T.notify.unread : T.notify.read}
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-center font-mono text-[11px]",
                        id === "unread" && counts.unread ? "bg-danger text-surface" : "bg-line/60 text-ink-soft"
                      )}
                      dir="ltr"
                    >
                      {counts[id]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] font-semibold text-ink-soft" data-testid="notification-center-count">
                {unread ? plural(unread, T.notify.unreadCount) : T.notify.allRead}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" aria-hidden />
                <TextInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={T.notify.search}
                  aria-label={T.notify.search}
                  className="ps-9"
                />
              </div>
              <Select
                value={type}
                onChange={(event) => setType(event.target.value as NotificationType | "all")}
                aria-label={T.notify.typeFilter}
              >
                <option value="all">{T.notify.allTypes}</option>
                {present.map((id) => (
                  <option key={id} value={id}>
                    {notifyMeta(id).label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:hidden">{markAllButton}</div>
          </div>

          {groups.length ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              {groups.map((group) => (
                <section key={group.id} aria-label={group.label} data-group={group.id}>
                  <h2 className="flex items-center gap-2 border-b border-line/70 bg-subtle/60 px-4 py-2 text-[12.5px] font-bold text-navy md:px-5">
                    {group.label}
                    <span className="rounded-full bg-surface px-2 font-mono text-[11px] text-muted ring-1 ring-line" dir="ltr">
                      {group.items.length}
                    </span>
                  </h2>
                  <ul className="divide-y divide-line/60">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <NotificationItem item={item} role={role} showActions onRemove={setPendingRemove} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {moreHref ? (
                <div className="border-t border-line px-4 py-3 text-center">
                  <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore} className="font-bold">
                    {loadingMore ? T.common.loading : T.notify.loadMore}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
                {read === "all" && !filtered ? <Inbox className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
              </span>
              <p className="text-[15px] font-bold text-navy">{empty.title}</p>
              {empty.hint ? <p className="max-w-sm text-[13px] text-muted">{empty.hint}</p> : null}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={T.notify.removeTitle}
        body={
          <>
            <p>{T.notify.removeConfirm}</p>
            <p className="mt-2 text-ink-soft">{T.notify.removeHint}</p>
          </>
        }
        confirmLabel={T.notify.remove}
        tone="danger"
        busy={removeNote.isPending}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) return;
          const id = pendingRemove.id;
          removeNote.mutate(id, {
            onSuccess: () => {
              setExtra((current) => current.filter((item) => item.id !== id));
              setPendingRemove(null);
            },
          });
        }}
      />
    </div>
  );
}
