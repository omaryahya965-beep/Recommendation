"use client";

import { Bell, ChevronLeft, ChevronRight, LogOut, Menu, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MunicipalityLogo } from "@/components/brand/MunicipalityLogo";
import { Sheet } from "@/components/mobile/Sheet";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  mobileTabsFor,
  navFor,
  navItemActive,
  pageTitle,
  parentPath,
  profileHref,
  settingsFor,
  splitHref,
  topLevelPaths,
  type NavItem,
} from "@/components/shell/navigation";
import { logout } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useNavCounts } from "@/lib/hooks";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role, User } from "@/lib/types";

const EMPTY_PARAMS = new URLSearchParams();

/** The app bar title: detail pages are named for what they show. */
function mobileTitle(pathname: string): string {
  if (/\/(recommendations|my-tasks)\/\d+\/edit$/.test(pathname)) return T.create.editTitle;
  if (/\/(recommendations|my-tasks)\/\d+$/.test(pathname)) return T.case.title;
  if (/\/reports\/\d+$/.test(pathname)) return T.case.report;
  return pageTitle(pathname);
}

/** True on a tab-level page; detail pages get a back button and no tab bar. */
export function isTopLevel(role: Role, pathname: string): boolean {
  return topLevelPaths(role).includes(pathname);
}

function Badge({ value, className }: { value: number; className?: string }) {
  if (!value) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning-light px-1 font-mono text-[10.5px] font-bold leading-none text-warning-dark ring-2 ring-surface",
        className
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

/**
 * Phone top app bar: the page title, a back button on detail pages, search
 * and notifications. Gains a shadow once the page scrolls under it.
 */
export function MobileAppBar({
  role,
  user,
  pathname,
  onSearch,
}: {
  role: Role;
  user: User | null;
  pathname: string;
  onSearch: () => void;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const top = isTopLevel(role, pathname);
  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goBack = () => {
    // Within the app, behave like the platform back; from a deep link, go up.
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push(parentPath(role, pathname));
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-shadow md:hidden print:hidden",
        scrolled ? "border-line shadow-[0_2px_12px_rgb(20_32_30/0.08)]" : "border-transparent"
      )}
      data-testid="mobile-app-bar"
    >
      <div className="flex h-14 items-center gap-1 px-1.5">
        {top ? (
          <span className="ms-1.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy text-surface">
            <MunicipalityLogo size="sm" className="!size-7" />
          </span>
        ) : (
          <button
            type="button"
            onClick={goBack}
            aria-label={T.mobile.back}
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink hover:bg-subtle"
          >
            <DirBack className="size-6" aria-hidden />
          </button>
        )}
        <p className="min-w-0 flex-1 truncate px-2 font-heading text-[17px] font-bold text-navy">{mobileTitle(pathname)}</p>
        <button
          type="button"
          onClick={onSearch}
          aria-label={T.nav.search}
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-subtle"
        >
          <Search className="size-5" aria-hidden />
        </button>
        {user ? (
          <NotificationBell role={role} />
        ) : (
          <span className="flex size-12 items-center justify-center text-ink-soft" aria-hidden>
            <Bell className="size-5" />
          </span>
        )}
      </div>
    </header>
  );
}

function TabLink({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5"
    >
      <span
        className={cn(
          "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
          active ? "bg-primary-light text-primary-dark" : "text-ink-soft group-hover:bg-subtle"
        )}
      >
        <Icon className="size-[22px]" aria-hidden />
        <Badge value={count} className="absolute -top-1 end-1.5" />
      </span>
      <span
        className={cn(
          "w-full truncate px-0.5 text-center text-[11.5px] leading-tight",
          active ? "font-bold text-primary-dark" : "font-medium text-ink-soft"
        )}
      >
        {item.label}
      </span>
      {count ? <span className="sr-only">{T.nav.badgeLabel.replace("{n}", String(count))}</span> : null}
    </Link>
  );
}

/** Phone bottom navigation: the role's main tabs plus "More". */
export function MobileBottomNav({
  role,
  user,
  pathname,
  searchParams,
}: {
  role: Role;
  user: User | null;
  pathname: string;
  searchParams?: URLSearchParams;
}) {
  useI18n();
  const { data: counts } = useNavCounts(Boolean(user));
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const tabs = mobileTabsFor(role);
  const params = searchParams ?? EMPTY_PARAMS;
  const tabPaths = new Set(tabs.map((tab) => splitHref(tab.href).path));
  const moreItems = [
    ...navFor(role)
      .flatMap((group) => group.items)
      .filter((item) => !tabPaths.has(splitHref(item.href).path)),
    settingsFor(role),
  ];
  const moreActive = moreItems.some((item) => navItemActive(pathname, params, item.href)) ||
    pathname === profileHref(role);

  if (!isTopLevel(role, pathname)) return null;

  return (
    <>
      <div className="h-[calc(4.25rem+env(safe-area-inset-bottom))] md:hidden print:hidden" aria-hidden />
      <nav
        aria-label={T.mobile.mainNav}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/97 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(20_32_30/0.06)] backdrop-blur-md md:hidden print:hidden"
        data-testid="mobile-bottom-nav"
      >
        <div className="mx-auto flex h-[4.25rem] max-w-xl items-stretch">
          {tabs.map((tab) => (
            <TabLink
              key={tab.href}
              item={tab}
              active={navItemActive(pathname, params, tab.href)}
              count={tab.count ? (counts?.[tab.count] ?? 0) : 0}
            />
          ))}
          <button
            ref={moreRef}
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5"
          >
            <span
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                moreActive ? "bg-primary-light text-primary-dark" : "text-ink-soft group-hover:bg-subtle"
              )}
            >
              <Menu className="size-[22px]" aria-hidden />
            </span>
            <span className={cn("text-[11.5px] leading-tight", moreActive ? "font-bold text-primary-dark" : "font-medium text-ink-soft")}>
              {T.mobile.more}
            </span>
          </button>
        </div>
      </nav>

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={T.mobile.moreTitle}
        testId="more-sheet"
        returnFocusRef={moreRef}
      >
        <Link
          href={profileHref(role)}
          onClick={() => setMoreOpen(false)}
          className="mb-3 flex min-h-16 items-center gap-3 rounded-2xl bg-subtle/70 px-4 py-3"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-navy text-surface">
            <UserRound className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-ink">
              {user ? user.full_name_ar || user.username : T.nav.profile}
            </span>
            <span className="block truncate text-[12.5px] text-ink-soft">
              {user?.municipality_name || ROLE_LABELS[role]}
            </span>
          </span>
        </Link>
        <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line">
          {moreItems.map((item) => {
            const Icon = item.icon;
            const count = item.count ? (counts?.[item.count] ?? 0) : 0;
            const active = navItemActive(pathname, params, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 px-4 text-[15px]",
                    active ? "bg-primary-light/50 font-bold text-primary-dark" : "font-medium text-ink"
                  )}
                >
                  <Icon className="size-5 shrink-0 text-ink-soft" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <Badge value={count} />
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-danger/25 px-4 text-[15px] font-semibold text-danger-dark hover:bg-danger-light/50"
        >
          <LogOut className="size-5" aria-hidden />
          {T.nav.logout}
        </button>
      </Sheet>
    </>
  );
}
