"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatDateTime, recordCode, relativeTimeAr } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import {
  notificationHref,
  notificationsCenter,
  notifyMeta,
  requiredAction,
  sortNotifications,
  userMustAct,
} from "@/lib/notifications";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from "@/lib/hooks";
import type { Role } from "@/lib/types";

const TONE: Record<string, string> = {
  danger: "text-danger-dark",
  warning: "text-warning-dark",
  primary: "text-primary-dark",
  info: "text-info-dark",
  neutral: "text-muted",
};

function centerHref(role: Role) {
  return notificationsCenter(role);
}

export function NotificationBell({ role }: { role: Role }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: count } = useUnreadCount();
  const { data: list, isLoading, isError, refetch } = useNotifications(open);
  const markAll = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const preview = useMemo(() => sortNotifications(list?.results ?? []).slice(0, 5), [list]);
  const unread = count?.unread ?? 0;
  const badge = unread > 9 ? T.notify.badgeMore : unread > 0 ? String(unread) : null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell trigger */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-9 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={T.nav.notifications}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {badge ? (
          <span className="absolute -top-0.5 -end-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface">
            {badge}
          </span>
        ) : null}
      </button>

      {/* Dropdown panel */}
      {open ? (
        <div className="absolute end-0 z-50 mt-2 w-[26rem] max-w-[92vw] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-[13.5px] font-bold text-navy">{T.notify.previewTitle}</p>
              <p className="text-[11px] font-medium text-muted">{T.notify.subtitle}</p>
            </div>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-[12px] font-bold text-primary-dark hover:underline"
              >
                {T.notify.markAllRead}
              </button>
            ) : null}
          </header>

          {/* List */}
          <div className="max-h-[28rem] overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-10 text-center text-sm font-semibold text-ink-soft">{T.common.loading}</p>
            ) : isError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-ink-soft">{T.common.error}</p>
                <button type="button" onClick={() => refetch()} className="mt-2 text-sm font-bold text-primary-dark hover:underline">
                  {T.common.retry}
                </button>
              </div>
            ) : preview.length ? (
              <ul>
                {preview.map((item) => {
                  const meta = notifyMeta(item.type);
                  const action = requiredAction(item, role);
                  const mustAct = userMustAct(item, role);
                  return (
                    <li key={item.id} className={cn("border-b border-line last:border-0", !item.is_read && "bg-subtle/50")}>
                      <Link
                        href={notificationHref(item, role)}
                        onClick={() => {
                          if (!item.is_read) markRead.mutate(item.id);
                          setOpen(false);
                        }}
                        className="block px-4 py-3 transition-colors hover:bg-subtle/80"
                      >
                        {/* Type label */}
                        <p className={cn("inline-flex items-center gap-1.5 text-[11.5px] font-bold", TONE[meta.tone])}>
                          <span aria-hidden>{meta.marker}</span>
                          {meta.label}
                          {!item.is_read ? (
                            <span className="size-1.5 rounded-full bg-primary" aria-label={T.notify.unread} />
                          ) : null}
                        </p>

                        {/* Message */}
                        <p className={cn("mt-1 text-[13.5px] leading-snug text-ink", !item.is_read && "font-semibold")}>
                          {item.message}
                        </p>

                        {/* Record code */}
                        {item.recommendation ? (
                          <p className="mt-0.5 font-mono text-[11px] font-medium text-muted" dir="ltr">
                            {recordCode(item.recommendation)}
                          </p>
                        ) : null}

                        {/* Required action */}
                        {mustAct && action ? (
                          <p className="mt-1.5 text-[12px] font-semibold text-navy">
                            {T.notify.requiredAction}: {action}
                          </p>
                        ) : null}

                        {/* Timestamp */}
                        <time
                          className="mt-1 block font-mono text-[10px] text-muted"
                          dateTime={item.sent_at}
                          title={formatDateTime(item.sent_at)}
                        >
                          {relativeTimeAr(item.sent_at)}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-sm font-semibold text-ink-soft">{T.notify.emptyHint}</p>
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-line bg-subtle/30 px-4 py-3">
            <Link
              href={centerHref(role)}
              onClick={() => setOpen(false)}
              className="block text-center text-[13px] font-bold text-primary-dark hover:underline"
            >
              {T.notify.viewAll}
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
