"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Search,
  Settings,
  ChevronRight
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { MunicipalityLogo } from "@/components/brand/MunicipalityLogo";
import { DirCollapse } from "@/components/i18n/DirIcon";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MobileAppBar, MobileBottomNav } from "@/components/shell/MobileChrome";
import { MobileSearchOverlay } from "@/components/shell/MobileSearchOverlay";
import { usePrefetchAIInsights } from "@/lib/ai";
import { Skeleton } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api, loadAuth, logout, ROLE_HOME } from "@/lib/api";
import { useNavCounts } from "@/lib/hooks";
import { useIsTablet } from "@/lib/useMediaQuery";
import {
  navFor,
  navItemActive,
  pageTitle,
  profileHref,
  searchBase,
  settingsFor,
} from "@/components/shell/navigation";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Paginated, RecommendationListItem, Role, User } from "@/lib/types";

function GlobalSearch({ role }: { role: Role }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const numericId = useMemo(() => {
    const raw = debounced.replace(/^REC-?/i, "");
    return /^\d+$/.test(raw) ? Number(raw) : null;
  }, [debounced]);

  const { data } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () =>
      api<Paginated<RecommendationListItem>>(
        `/api/recommendations/?search=${encodeURIComponent(debounced)}&page_size=8`
      ),
    enabled: debounced.length >= 2 && numericId === null,
  });

  const { data: byId } = useQuery({
    queryKey: ["global-search-id", numericId],
    queryFn: () => api<RecommendationListItem>(`/api/recommendations/${numericId}/`),
    enabled: numericId !== null,
    retry: false,
  });

  const results = byId ? [byId] : (data?.results ?? []);
  const base = searchBase(role);

  return (
    <div className="relative min-w-0 flex-1 max-w-xl" ref={boxRef}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={T.nav.searchPlaceholder}
        className="h-10 w-full rounded-(--radius-field) border border-line bg-surface py-2 ps-10 pe-[4.5rem] text-[13px] outline-none transition-all placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-muted/30"
        aria-label={T.nav.search}
      />
      <kbd className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">
        {T.nav.searchShortcut}
      </kbd>
      {open && debounced.length >= 2 ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-(--radius-panel) border border-line bg-elevated shadow-(--shadow-panel)">
          <p className="bg-subtle px-4 py-2 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">{T.nav.recommendations}</p>
          {results.length ? (
            <ul className="py-1">
              {results.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${base}/${item.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                    className="block px-4 py-3 transition-colors hover:bg-primary-light/50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium text-primary-dark" dir="ltr">
                        REC-{String(item.id).padStart(4, "0")}
                      </span>
                      <StatusBadge status={item.status} />
                    </span>
                    <span className="mt-1.5 line-clamp-1 block text-[13px] font-medium text-ink">{clipTitle(item.title, 80)}</span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {role === "department_head"
                        ? item.responsible_employee || item.report_title
                        : `${item.department_name}${item.responsible_employee ? ` · ${item.responsible_employee}` : ""}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-ink-soft">{T.empty.search}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface SidebarNavProps {
  role: Role;
  pathname: string;
  collapsed: boolean;
}

const NO_SEARCH_PARAMS = new URLSearchParams();

function SidebarNavWithParams(props: SidebarNavProps) {
  return <SidebarNavView {...props} searchParams={useSearchParams()} />;
}

/**
 * useSearchParams() cannot be read while prerendering a static page: it makes
 * the nearest Suspense boundary render its fallback instead. Scoping that to
 * the nav alone, with a fallback that is the same nav minus query-string
 * matching, keeps the whole shell in the static HTML.
 */
function SidebarNav(props: SidebarNavProps) {
  return (
    <Suspense fallback={<SidebarNavView {...props} searchParams={NO_SEARCH_PARAMS} />}>
      <SidebarNavWithParams {...props} />
    </Suspense>
  );
}

function SidebarNavView({
  role,
  pathname,
  collapsed,
  searchParams,
}: SidebarNavProps & { searchParams: URLSearchParams }) {
  useI18n();
  const groups = navFor(role);
  const { data: counts } = useNavCounts();

  const itemCls = (active: boolean) =>
    cn(
      "group relative flex min-h-12 items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-all duration-200 md:min-h-0 md:text-[13.5px]",
      collapsed && "justify-center px-2 py-3",
      active
        ? "bg-sidebar-hover text-sidebar-text font-semibold"
        : "text-sidebar-muted hover:bg-sidebar-hover/50 hover:text-sidebar-text"
    );

  return (
    <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group, groupIndex) => (
        <div key={group.id} className={cn(groupIndex > 0 && "mt-6")}>
          {group.label && !collapsed ? (
            <p className="mb-2 px-3 text-[11px] font-bold text-sidebar-muted/70">
              {group.label}
            </p>
          ) : null}
          {group.label && collapsed ? (
            <span aria-hidden className="mx-auto mb-3 block h-[2px] w-4 rounded-full bg-sidebar-muted/20" />
          ) : null}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = navItemActive(pathname, searchParams, item.href);
              const Icon = item.icon;
              const badge = item.count ? (counts?.[item.count] ?? 0) : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={itemCls(active)}
                >
                  {active ? (
                    <span className="absolute inset-y-1.5 start-0 w-[4px] rounded-r-md bg-primary-dark shadow-[0_0_8px_rgba(15,79,73,0.6)]" aria-hidden />
                  ) : null}
                  <span className="relative shrink-0">
                    <Icon className={cn("size-5 transition-colors", active ? "text-primary-dark" : "text-sidebar-muted group-hover:text-sidebar-text")} />
                    {collapsed && badge ? (
                      <span aria-hidden className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 font-mono text-[10px] font-bold text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </span>
                  {collapsed ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  {badge ? (
                    <>
                      {!collapsed ? (
                        <span
                          aria-hidden
                          className="ms-auto rounded-full bg-warning/90 px-2 py-0.5 font-mono text-[11px] font-bold leading-none text-white"
                          dir="ltr"
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                      <span className="sr-only">{T.nav.badgeLabel.replace("{n}", String(badge))}</span>
                    </>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ShellInner({ role, children }: { role: Role; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const auth = loadAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    if (auth.user.role !== role) {
      router.replace(ROLE_HOME[auth.user.role] ?? "/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(auth.user);
    setChecked(true);
  }, [role, router]);

  // The frame (sidebar, header, navigation) comes from the route's role and
  // holds no private data, so it renders at once — into the static HTML and
  // before hydration. The session lives in localStorage, readable only in the
  // browser: the page itself, which fetches private data, and the user's name
  // wait for the check above, which also redirects a wrong or missing session.
  const signedIn = checked ? user : null;
  return (
    <ShellFrame role={role} user={signedIn} pathname={pathname}>
      {signedIn ? <Suspense fallback={<ContentSkeleton />}>{children}</Suspense> : <ContentSkeleton />}
    </ShellFrame>
  );
}

/** Neutral page placeholder shown until the session check lets the page mount. */
function ContentSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

const SIDEBAR_KEY = "audit_sidebar_collapsed";
const sidebarListeners = new Set<() => void>();

function subscribeSidebar(listener: () => void) {
  sidebarListeners.add(listener);
  return () => sidebarListeners.delete(listener);
}

function readSidebarCollapsed() {
  return window.localStorage.getItem(SIDEBAR_KEY) === "1";
}

/**
 * The saved sidebar width. Server render and hydration use the expanded
 * default (localStorage does not exist there), then the saved value applies —
 * reading it during the first render would mismatch the static HTML.
 */
function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
  const toggle = () => {
    window.localStorage.setItem(SIDEBAR_KEY, readSidebarCollapsed() ? "0" : "1");
    sidebarListeners.forEach((listener) => listener());
  };
  return [collapsed, toggle] as const;
}

function ShellFrame({
  role,
  user,
  pathname,
  children,
}: {
  role: Role;
  /** Null until the browser-side session check passes (and on the server). */
  user: User | null;
  pathname: string;
  children: ReactNode;
}) {
  useI18n();
  usePrefetchAIInsights(role, user !== null);
  const [savedCollapsed, toggleCollapsed] = useSidebarCollapsed();
  // Tablets (768–1023px) always get the icon rail: a full sidebar would leave
  // too little room for the page.
  const tablet = useIsTablet();
  const collapsed = savedCollapsed || tablet;
  const [searchOpen, setSearchOpen] = useState(false);
  const settings = settingsFor(role);
  const profile = profileHref(role);

  const initials = user ? (user.full_name_ar || user.username).slice(0, 1) : "";
  // Settings and profile links carry no query string, so only the path matters.
  const settingsActive = navItemActive(pathname, NO_SEARCH_PARAMS, settings.href);
  const profileActive = navItemActive(pathname, NO_SEARCH_PARAMS, profile);

  const sidebar = (
    <>
      <div className={cn("flex shrink-0 items-center border-b border-sidebar-muted/10 bg-sidebar/95 py-6", collapsed ? "justify-center px-2" : "px-6")}>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-dark to-primary shadow-lg ring-1 ring-white/10">
            <MunicipalityLogo size="sm" />
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <Image
                src="/images/brand/raqeeb-logo-light.webp"
                alt={T.appName}
                width={760}
                height={397}
                sizes="96px"
                draggable={false}
                className="h-9 w-auto select-none"
              />
              <p className="truncate text-[12px] font-medium text-sidebar-muted">
                {ROLE_LABELS[role]}
              </p>
            </div>
          )}
        </div>
      </div>
      
      <SidebarNav role={role} pathname={pathname} collapsed={collapsed} />
      
      {/* Footer Zone */}
      <div className="shrink-0 border-t border-sidebar-muted/10 bg-sidebar/95 p-3">
        <Link
          href={settings.href}
          title={collapsed ? settings.label : undefined}
          className={cn(
            "group relative flex min-h-12 items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors",
            collapsed && "justify-center px-2",
            settingsActive ? "bg-sidebar-hover text-sidebar-text font-medium" : "text-sidebar-muted hover:bg-sidebar-hover/50 hover:text-sidebar-text"
          )}
        >
          {settingsActive ? (
            <span className="absolute inset-y-1.5 start-0 w-[4px] rounded-r-md bg-primary-dark" aria-hidden />
          ) : null}
          <Settings className={cn("size-[18px] shrink-0 transition-colors", settingsActive ? "text-primary-dark" : "text-sidebar-muted group-hover:text-sidebar-text")} />
          {collapsed ? <span className="sr-only">{settings.label}</span> : settings.label}
        </Link>
        
        <div className={cn("mt-2 flex items-center gap-2 rounded-lg bg-sidebar-hover/30 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]", collapsed && "justify-center p-1.5")}>
          <Link
            href={profile}
            title={user ? user.full_name_ar || user.username : undefined}
            aria-label={T.nav.profile}
            aria-current={profileActive ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 transition-colors",
              collapsed && "flex-none justify-center p-0",
              profileActive ? "bg-sidebar-hover text-sidebar-text" : "hover:bg-sidebar-hover/60"
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sidebar-hover font-heading text-[13px] font-bold text-white shadow-sm ring-1 ring-white/5">
              {initials}
            </div>
            {collapsed ? <span className="sr-only">{T.nav.profile}</span> : user ? (
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-[13px] font-semibold text-white">{user.full_name_ar || user.username}</p>
                <p className="truncate text-[12px] text-sidebar-muted">{user.municipality_name || ROLE_LABELS[user.role]}</p>
              </div>
            ) : (
              // Same two-line height as the filled block, so nothing shifts.
              <div className="min-w-0 flex-1 space-y-1.5" aria-hidden>
                <div className="h-3.5 w-24 animate-pulse rounded bg-sidebar-hover" />
                <div className="h-3 w-16 animate-pulse rounded bg-sidebar-hover/70" />
              </div>
            )}
          </Link>
          {collapsed ? null : (
            <button
              type="button"
              onClick={logout}
              title={T.nav.logout}
              aria-label={T.nav.logout}
              className="flex size-12 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-danger-dark/20 hover:text-danger-dark transition-colors"
            >
              <LogOut className="size-5" />
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-e border-sidebar-muted/10 bg-sidebar text-sidebar-text shadow-xl transition-all duration-300 md:flex z-50 print:hidden",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {sidebar}
      </aside>

      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        role={role}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileAppBar role={role} user={user} pathname={pathname} onSearch={() => setSearchOpen(true)} />
        <header className="sticky top-0 z-40 hidden min-w-0 border-b border-line bg-surface/95 shadow-sm backdrop-blur-md md:block print:hidden">
          <div className="flex h-14 min-w-0 items-center gap-1 px-2 md:justify-between md:gap-3 md:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-1 md:gap-3">
              {tablet ? null : (
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-md text-ink-soft hover:bg-subtle"
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? T.nav.expand : T.nav.collapse}
                >
                  <DirCollapse collapsed={collapsed} className="size-5" />
                </button>
              )}

              <div className="hidden min-w-0 items-center gap-2 text-[13px] text-muted lg:flex">
                <span>{T.appName}</span>
                <ChevronRight className="size-3.5 shrink-0 rtl:rotate-180" />
                <span className="truncate font-semibold text-navy">{pageTitle(pathname)}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 md:gap-4">
              <div className="hidden w-72 md:block lg:w-96">
                <GlobalSearch role={role} />
              </div>
              <div className="hidden h-5 w-px bg-line md:block" />
              {user ? (
                <NotificationBell role={role} />
              ) : (
                // Same footprint as the bell; its unread poll needs a session.
                <span className="flex size-12 items-center justify-center text-ink-soft md:size-9" aria-hidden>
                  <Bell className="size-5" />
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[90rem] min-w-0 flex-1 px-4 py-4 sm:px-6 md:py-6 lg:px-8 xl:py-8">
          <div className="animate-fade-in min-w-0">{children}</div>
        </main>
        <MobileBottomNav role={role} user={user} pathname={pathname} />
      </div>
    </div>
  );
}

export default function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  return <ShellInner role={role}>{children}</ShellInner>;
}
