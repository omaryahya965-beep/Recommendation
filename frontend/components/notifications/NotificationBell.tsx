"use client";

import { Bell, ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";
import { cn } from "@/lib/cn";
import { formatDateTime, recordCode, relativeTimeAr } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import {
  notificationHref,
  notificationTitle,
  notificationsCenter,
  notifyMeta,
  requiredAction,
  userMustAct,
} from "@/lib/notifications";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from "@/lib/hooks";
import type { AppNotification, Role } from "@/lib/types";

const TONE: Record<string, string> = {
  danger: "text-danger-dark",
  warning: "text-warning-dark",
  primary: "text-primary-dark",
  info: "text-info-dark",
  neutral: "text-muted",
};

function newestFirst(items: AppNotification[]) {
  return [...items].sort((a, b) => {
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
    return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
  });
}

export function NotificationBell({ role }: { role: Role }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pickedRef = useRef(false);
  const { data: count } = useUnreadCount();
  const { data: list, isLoading, isError, refetch } = useNotifications(true);
  const markAll = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();

  useFocusTrap(open, panelRef, () => setOpen(false), closeRef);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const preview = useMemo(() => newestFirst(list?.results ?? []).slice(0, 20), [list]);

  useEffect(() => {
    if (!open) {
      pickedRef.current = false;
      setSelectedId(null);
      return;
    }
    if (pickedRef.current || !preview.length) return;
    pickedRef.current = true;
    setSelectedId(preview[0].id);
  }, [open, preview]);

  const unread = count?.unread ?? 0;
  const badge = unread > 9 ? T.notify.badgeMore : unread > 0 ? String(unread) : null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-12 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:size-9"
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

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-surface md:absolute md:inset-auto md:end-0 md:mt-2 md:max-h-[min(32rem,80vh)] md:w-[26rem] md:max-w-[92vw] md:overflow-hidden md:rounded-2xl md:border md:border-line md:shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label={T.nav.notifications}
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:pt-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-navy md:text-[13.5px]">{T.notify.previewTitle}</p>
              <p className="text-[13px] font-medium text-muted md:text-[11px]">{T.notify.nowHint}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="min-h-11 rounded-lg px-3 text-[13px] font-bold text-primary-dark"
                >
                  {T.notify.markAllRead}
                </button>
              ) : null}
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-11 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle md:size-9"
                aria-label={T.nav.close}
              >
                <X className="size-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && !list ? (
              <p className="px-4 py-10 text-center text-[15px] font-semibold text-ink-soft">{T.common.loading}</p>
            ) : isError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[15px] font-semibold text-ink-soft">{T.common.error}</p>
                <button type="button" onClick={() => refetch()} className="mt-2 min-h-11 text-[15px] font-bold text-primary-dark">
                  {T.common.retry}
                </button>
              </div>
            ) : preview.length ? (
              <ul>
                {preview.map((item) => {
                  const meta = notifyMeta(item.type);
                  const action = requiredAction(item, role);
                  const mustAct = userMustAct(item, role);
                  const expanded = selectedId === item.id;
                  return (
                    <li key={item.id} className={cn("border-b border-line last:border-0", !item.is_read && "bg-primary/5")}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(expanded ? null : item.id);
                          if (!item.is_read) markRead.mutate(item.id);
                        }}
                        className="block w-full min-h-14 px-4 py-3.5 text-start"
                      >
                        <p className="flex items-center justify-between gap-2">
                          <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-bold", TONE[meta.tone])}>
                            <span aria-hidden>{meta.marker}</span>
                            {meta.label}
                            {!item.is_read ? (
                              <span className="size-2 rounded-full bg-primary" aria-label={T.notify.unread} />
                            ) : null}
                          </span>
                          {expanded ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
                        </p>
                        <p className={cn("mt-1.5 text-[14.5px] leading-snug text-ink", !item.is_read && "font-bold")}>
                          {item.message}
                        </p>
                        {item.recommendation ? (
                          <p className="mt-1 font-mono text-[12px] font-medium text-muted" dir="ltr">
                            {recordCode(item.recommendation)}
                          </p>
                        ) : null}
                        <time
                          className="mt-1 block font-mono text-[12px] text-muted"
                          dateTime={item.sent_at}
                          title={formatDateTime(item.sent_at)}
                        >
                          {relativeTimeAr(item.sent_at)}
                        </time>
                      </button>
                      {expanded ? (
                        <div className="space-y-2.5 border-t border-line/70 bg-subtle/40 px-4 py-3">
                          <p className="text-[12px] font-bold text-muted">{T.notify.whatHappened}</p>
                          <p className="text-[13.5px] font-medium leading-relaxed text-ink">{item.message}</p>
                          {item.recommendation ? (
                            <p className="text-[13px] text-ink-soft">
                              <span className="font-bold text-navy">{T.notify.related}: </span>
                              <span className="font-mono" dir="ltr">
                                {recordCode(item.recommendation)}
                              </span>
                              {" — "}
                              {notificationTitle(item)}
                            </p>
                          ) : null}
                          {mustAct && action ? (
                            <p className="rounded-lg border border-navy/10 bg-navy/5 px-3 py-2 text-[12.5px] font-semibold text-navy">
                              <span className="font-bold">{T.notify.requiredAction}: </span>
                              {action}
                            </p>
                          ) : null}
                          <Link
                            href={notificationHref(item, role)}
                            onClick={() => setOpen(false)}
                            className="inline-flex min-h-11 items-center text-[13.5px] font-bold text-primary-dark hover:underline"
                          >
                            {mustAct ? T.notify.takeAction : T.notify.openCase}
                          </Link>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-[15px] font-semibold text-ink-soft">{T.notify.emptyHint}</p>
            )}
          </div>

          <footer className="border-t border-line bg-subtle/30 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link
              href={notificationsCenter(role)}
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center justify-center text-center text-[15px] font-bold text-primary-dark"
            >
              {T.notify.viewAll}
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
