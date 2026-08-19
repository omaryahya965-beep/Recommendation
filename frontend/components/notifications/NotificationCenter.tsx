"use client";

import { Bell, Check } from "lucide-react";
import { useMemo, useState } from "react";

import { DirBack } from "@/components/i18n/DirIcon";
import { NotificationDetail } from "@/components/notifications/NotificationDetail";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { Button, ErrorBanner, TextInput } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import {
  filterNotifications,
  groupForAction,
  nextPathFromUrl,
  sortNotifications,
  userMustAct,
  type NotifyFilter,
} from "@/lib/notifications";
import type { AppNotification, Paginated, Role } from "@/lib/types";

function notifyFilters(): Array<{ id: NotifyFilter; label: string }> {
  return [
    { id: "all", label: T.notify.all },
    { id: "unread", label: T.notify.unread },
    { id: "action", label: T.notify.actionRequired },
    { id: "overdue", label: T.notify.overdue },
    { id: "deadline", label: T.notify.approaching },
    { id: "returned", label: T.notify.returnedFilter },
    { id: "status", label: T.notify.statusChange },
    { id: "linked", label: T.notify.linked },
    { id: "older", label: T.notify.older },
  ];
}

function NotificationSkeleton() {
  useI18n();
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="flex border border-line">
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
      </div>
      <div className="border border-line">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2 border-b border-line px-4 py-3 last:border-0">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotificationCenter({ role, embedded = false }: { role: Role; embedded?: boolean }) {
  useI18n();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const removeNote = useDeleteNotification();
  const [filter, setFilter] = useState<NotifyFilter>("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"priority" | "newest">("priority");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<AppNotification | null>(null);
  const [extra, setExtra] = useState<AppNotification[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const merged = useMemo(() => {
    const pageItems = data?.results ?? [];
    const seen = new Set(pageItems.map((item) => item.id));
    return [...pageItems, ...extra.filter((item) => !seen.has(item.id))];
  }, [data?.results, extra]);

  const items = useMemo(
    () => (sortMode === "newest" ? [...merged].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()) : sortNotifications(merged)),
    [merged, sortMode]
  );
  const visible = useMemo(() => filterNotifications(items, filter, query), [items, filter, query]);
  const grouped = groupForAction(visible);
  const selected = visible.find((item) => item.id === selectedId) ?? null;

  const unread = items.filter((item) => !item.is_read).length;
  const actionable = items.filter((item) => userMustAct(item, role)).length;
  const overdue = items.filter((item) => item.type === "overdue" || item.overdue).length;
  const hasStatusChange = items.some((item) => item.type === "status_change");
  const hasReturned = items.some((item) => item.type === "returned");
  const hasDeadline = items.some((item) => item.type === "deadline_approaching" || item.type === "due_today");
  const filters = notifyFilters().filter((item) => {
    if (item.id === "status") return hasStatusChange;
    if (item.id === "returned") return hasReturned;
    if (item.id === "deadline") return hasDeadline;
    return true;
  });
  const moreHref = extra.length === 0 ? nextPathFromUrl(data?.next ?? null) : nextPage;

  const emptyTitle =
    filter === "unread"
      ? T.notify.emptyUnread
      : filter === "action"
        ? T.notify.emptyAction
        : query || filter !== "all"
          ? T.notify.emptyFilter
          : T.notify.empty;
  const emptyHint =
    filter === "unread"
      ? T.notify.emptyUnreadHint
      : filter === "action"
        ? T.notify.emptyActionHint
        : filter !== "all" || query
          ? undefined
          : T.notify.emptyHint;

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

  if (isLoading) return <NotificationSkeleton />;
  if (isError) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="max-w-xl text-sm text-ink-soft">{T.notify.subtitle}</p>
          {unread > 0 ? (
            <Button variant="ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {T.notify.markAllRead}
            </Button>
          ) : null}
        </div>
      ) : (
        <PageHeader
          title={T.notify.title}
          description={T.notify.subtitle}
          actions={
            unread > 0 ? (
              <Button variant="ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                {T.notify.markAllRead}
              </Button>
            ) : null
          }
        />
      )}

      <dl className="flex flex-wrap divide-line border border-line bg-surface sm:divide-x sm:rtl:divide-x-reverse">
        <div className="min-w-[8rem] flex-1 px-4 py-3">
          <dt className="text-[12px] text-muted">{T.notify.actionRequired}</dt>
          <dd className="mt-0.5 font-heading text-2xl font-bold text-navy" dir="ltr">
            {actionable}
          </dd>
        </div>
        <div className="min-w-[8rem] flex-1 px-4 py-3">
          <dt className="text-[12px] text-muted">{T.notify.overdue}</dt>
          <dd
            className={cn("mt-0.5 font-heading text-2xl font-bold", overdue ? "text-danger-dark" : "text-navy")}
            dir="ltr"
          >
            {overdue}
          </dd>
        </div>
        <div className="min-w-[8rem] flex-1 px-4 py-3">
          <dt className="text-[12px] text-muted">{T.notify.unread}</dt>
          <dd className="mt-0.5 font-heading text-2xl font-bold text-navy" dir="ltr">
            {unread}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "border px-3 py-1.5 text-[13px] font-medium transition-colors",
              filter === item.id
                ? "border-inverse bg-inverse text-on-inverse"
                : "border-line bg-surface text-ink-soft hover:border-navy/40 hover:text-navy"
            )}
          >
            {item.label}
          </button>
        ))}
        <label className="ms-auto flex items-center gap-2 text-[12px] text-muted">
          {T.register.sortBy}
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as "priority" | "newest")}
            className="border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
          >
            <option value="priority">{T.notify.sortPriority}</option>
            <option value="newest">{T.notify.sortNewest}</option>
          </select>
        </label>
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={T.notify.search}
          aria-label={T.notify.search}
          className="max-w-xs"
        />
      </div>
      <p className="text-[11px] text-muted">{T.notify.searchHint}</p>

      {visible.length === 0 ? (
        <EmptyState
          icon={filter === "all" && !query ? <Check className="size-6" /> : <Bell className="size-6" />}
          title={emptyTitle}
          description={emptyHint}
          className="border-dashed shadow-none"
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:border lg:border-line">
          <div className={cn("border border-line lg:border-0 lg:border-e", selected && "hidden lg:block")}>
            {grouped.map((group) => (
              <section key={group.id}>
                <h2 className="sticky top-0 z-10 border-b border-line bg-subtle px-4 py-2 text-[12px] font-semibold text-navy">
                  {group.label}
                  <span className="ms-2 font-mono font-normal text-muted" dir="ltr">
                    {group.items.length}
                  </span>
                </h2>
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    role={role}
                    selected={selected?.id === item.id}
                    onSelect={(next) => {
                      setSelectedId(next.id);
                      if (!next.is_read) markRead.mutate(next.id);
                    }}
                    onRemove={setPendingRemove}
                  />
                ))}
              </section>
            ))}
            {moreHref ? (
              <div className="border-t border-line px-4 py-3">
                <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? T.common.loading : T.notify.loadMore}
                </Button>
              </div>
            ) : null}
          </div>

          <div className={cn("border border-line p-5 lg:border-0", !selected && "hidden lg:block")}>
            {selected ? (
              <>
                <button
                  type="button"
                  className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-soft lg:hidden"
                  onClick={() => setSelectedId(null)}
                >
                  <DirBack className="size-4" />
                  {T.notify.title}
                </button>
                <NotificationDetail
                  item={selected}
                  role={role}
                  onMarkRead={() => {
                    if (!selected.is_read) markRead.mutate(selected.id);
                  }}
                  onRemove={() => setPendingRemove(selected)}
                />
              </>
            ) : (
              <p className="hidden py-16 text-center text-sm text-muted lg:block">{T.notify.selectHint}</p>
            )}
          </div>
        </div>
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
              if (selectedId === id) setSelectedId(null);
              setPendingRemove(null);
            },
          });
        }}
      />
    </div>
  );
}
