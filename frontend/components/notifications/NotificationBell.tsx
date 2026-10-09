"use client";

import { Bell, BellOff, CheckCheck, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import {
  useMarkAllNotificationsRead,
  useNotifications,
  usePrefetchNotifications,
  useUnreadCount,
} from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { groupByTime, notificationsCenter } from "@/lib/notifications";
import { useIsPhone } from "@/lib/useMediaQuery";
import type { Role } from "@/lib/types";

const PREVIEW = 15;

/**
 * The bell and its panel.
 *
 * Phones: a full-screen sheet rendered into <body>. The app bar it is opened
 * from has a backdrop blur, which makes it the containing block of any
 * `position: fixed` child — a panel inside it was squeezed into the bar's
 * 56px and drawn under the bottom tabs. From the body it covers the screen,
 * above the bars, with the page behind locked.
 *
 * Wider screens: a dropdown under the bell.
 */
export function NotificationBell({ role }: { role: Role }) {
  useI18n();
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data: count } = useUnreadCount();
  // The full list is only needed while the panel is open; the badge runs off
  // the lightweight unread count, the one poll mounted on every page.
  const { data: list, isLoading, isError, refetch } = useNotifications(open);
  const prefetchList = usePrefetchNotifications();
  const markAll = useMarkAllNotificationsRead();

  const closePanel = useCallback(() => setOpen(false), []);
  useFocusTrap(open, panelRef, closePanel, closeRef, buttonRef);

  useEffect(() => {
    if (!open || phone) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, phone, closePanel]);

  const unread = count?.unread ?? 0;
  const badge = unread > 9 ? T.notify.badgeMore : unread > 0 ? String(unread) : null;
  const all = useMemo(() => list?.results ?? [], [list]);
  const listUnread = all.filter((item) => !item.is_read).length;
  const groups = useMemo(
    () => groupByTime((unreadOnly ? all.filter((item) => !item.is_read) : all).slice(0, 100)),
    [all, unreadOnly]
  );
  // The newest PREVIEW notifications, keeping their day groups.
  const limited = groups
    .map((group, index) => {
      const before = groups.slice(0, index).reduce((sum, previous) => sum + previous.items.length, 0);
      return { ...group, items: group.items.slice(0, Math.max(0, PREVIEW - before)) };
    })
    .filter((group) => group.items.length);

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-panel-title"
      data-testid="notification-panel"
      className={cn(
        "flex flex-col bg-surface",
        phone
          ? "fixed inset-0 z-[60] animate-fade-in"
          : "absolute end-0 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-5rem))] w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line shadow-xl"
      )}
    >
      <header
        className={cn(
          "border-b border-line px-4 pb-2.5",
          phone ? "pt-[max(0.75rem,env(safe-area-inset-top))]" : "pt-3.5"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 id="notify-panel-title" className="font-heading text-[17px] font-bold text-navy md:text-[15px]">
              {T.notify.title}
            </h2>
            <p className="text-[12.5px] font-medium text-muted md:text-[12px]" data-testid="notification-panel-count">
              {unread ? plural(unread, T.notify.unreadCount) : T.notify.allRead}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-bold text-primary-dark hover:bg-primary-light/50 md:min-h-9"
              >
                <CheckCheck className="size-4" aria-hidden />
                {T.notify.markAllRead}
              </button>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              onClick={closePanel}
              className="flex size-11 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle md:size-9"
              aria-label={T.nav.close}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex gap-1.5" role="group" aria-label={T.notify.title}>
          {([false, true] as const).map((only) => (
            <button
              key={String(only)}
              type="button"
              aria-pressed={unreadOnly === only}
              onClick={() => setUnreadOnly(only)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition-colors",
                unreadOnly === only ? "bg-inverse text-on-inverse" : "bg-subtle text-ink-soft hover:text-ink"
              )}
            >
              {only ? T.notify.unread : T.notify.all}
              {only && listUnread ? (
                <span className="min-w-5 rounded-full bg-danger px-1.5 text-center font-mono text-[10.5px] text-surface" dir="ltr">
                  {listUnread}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLoading && !list ? (
          <p className="px-4 py-10 text-center text-[14px] font-semibold text-ink-soft">{T.common.loading}</p>
        ) : isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] font-semibold text-ink-soft">{T.common.error}</p>
            <button type="button" onClick={() => refetch()} className="mt-2 min-h-11 text-[14px] font-bold text-primary-dark">
              {T.common.retry}
            </button>
          </div>
        ) : limited.length ? (
          limited.map((group) => (
            <section key={group.id} aria-label={group.label}>
              <h3 className="sticky top-0 z-10 border-b border-line/60 bg-surface/95 px-4 py-1.5 text-[11.5px] font-bold text-muted backdrop-blur-sm">
                {group.label}
              </h3>
              <ul className="divide-y divide-line/60">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NotificationItem item={item} role={role} onNavigate={closePanel} dense />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
              <BellOff className="size-5" aria-hidden />
            </span>
            <p className="text-[14px] font-bold text-navy">{unreadOnly ? T.notify.emptyUnread : T.notify.empty}</p>
            <p className="text-[12.5px] text-muted">{unreadOnly ? T.notify.emptyUnreadHint : T.notify.emptyHint}</p>
          </div>
        )}
      </div>

      <footer className={cn("border-t border-line bg-subtle/40", phone && "pb-[env(safe-area-inset-bottom)]")}>
        <Link
          href={notificationsCenter(role)}
          onClick={closePanel}
          data-testid="notification-view-all"
          className="flex min-h-12 items-center justify-center text-[14px] font-bold text-primary-dark hover:bg-primary-light/40"
        >
          {T.notify.viewAll}
        </Link>
      </footer>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={prefetchList}
        onFocus={prefetchList}
        className="relative flex size-12 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:size-9"
        aria-label={unread ? `${T.nav.notifications} — ${plural(unread, T.notify.unreadCount)}` : T.nav.notifications}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="notification-bell"
      >
        <Bell className="size-5" aria-hidden />
        {badge ? (
          <span
            className="absolute -top-0.5 -end-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold leading-none text-surface ring-2 ring-surface"
            data-testid="notification-badge"
            dir="ltr"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </button>
      {panel && phone && typeof document !== "undefined" ? createPortal(panel, document.body) : panel}
    </div>
  );
}
