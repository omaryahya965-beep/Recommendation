"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";

import { MunicipalLogo } from "@/components/brand/MunicipalLogo";
import { DirCollapse } from "@/components/i18n/DirIcon";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { usePrefetchAIInsights } from "@/lib/ai";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api, loadAuth, logout, ROLE_HOME } from "@/lib/api";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Paginated, RecommendationListItem, Role, User } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

/** Only routes the backend actually serves for this role appear here. */
function navFor(role: Role): NavGroup[] {
  const groups: Record<Role, NavGroup[]> = {
    audit: [
      {
        id: "home",
        items: [{ href: "/audit/dashboard", label: T.nav.dashboard, icon: LayoutDashboard }],
      },
      {
        id: "oversight",
        label: T.nav.groupOversight,
        items: [
          { href: "/audit/recommendations", label: T.nav.recommendations, icon: ClipboardList },
          { href: "/audit/reports", label: T.nav.reports, icon: FileText },
          { href: "/audit/reports/new", label: T.reports.addReport, icon: FilePlus2 },
          { href: "/audit/followup-reports", label: T.nav.followups, icon: BarChart3 },
        ],
      },
      {
        id: "intelligence",
        label: T.nav.groupIntelligence,
        items: [
          { href: "/audit/analytics", label: T.nav.analytics, icon: LineChart },
          { href: "/audit/assistant", label: T.nav.assistant, icon: Sparkles },
        ],
      },
    ],
    department_head: [
      {
        id: "home",
        items: [{ href: "/department/dashboard", label: T.nav.dashboard, icon: LayoutDashboard }],
      },
      {
        id: "work",
        label: T.nav.groupWork,
        items: [
          { href: "/department/recommendations", label: T.register.title, icon: ClipboardList },
          { href: "/department/team-progress", label: T.nav.teamProgress, icon: Users },
        ],
      },
      {
        id: "intelligence",
        label: T.nav.groupIntelligence,
        items: [
          { href: "/department/analytics", label: T.nav.analytics, icon: LineChart },
          { href: "/department/assistant", label: T.nav.assistant, icon: Sparkles },
        ],
      },
    ],
    employee: [
      {
        id: "home",
        items: [{ href: "/employee/my-tasks", label: T.nav.dashboard, icon: LayoutDashboard }],
      },
      {
        id: "work",
        label: T.nav.groupWork,
        items: [{ href: "/employee/recommendations", label: T.dashboard.myRecommendations, icon: ClipboardList }],
      },
      {
        id: "intelligence",
        label: T.nav.groupIntelligence,
        items: [
          { href: "/employee/analytics", label: T.nav.analytics, icon: LineChart },
          { href: "/employee/assistant", label: T.nav.assistant, icon: Sparkles },
        ],
      },
    ],
    council: [
      {
        id: "decisions",
        label: T.nav.groupDecisions,
        items: [
          { href: "/council/pending-approvals", label: T.nav.pendingApprovals, icon: ClipboardCheck },
          { href: "/council/closure-reviews", label: T.nav.closureReviews, icon: ClipboardList },
          { href: "/council/approved-history", label: T.nav.approvedHistory, icon: History },
        ],
      },
      {
        id: "oversight",
        label: T.nav.groupOversight,
        items: [
          { href: "/council/recommendations", label: T.nav.recommendations, icon: ClipboardList },
          { href: "/council/followup-reports", label: T.nav.followups, icon: BarChart3 },
        ],
      },
      {
        id: "intelligence",
        label: T.nav.groupIntelligence,
        items: [
          { href: "/council/analytics", label: T.nav.analytics, icon: LineChart },
          { href: "/council/assistant", label: T.nav.assistant, icon: Sparkles },
        ],
      },
    ],
  };
  return groups[role];
}

function settingsFor(role: Role): NavItem {
  const href =
    role === "audit"
      ? "/audit/settings"
      : role === "department_head"
        ? "/department/settings"
        : role === "employee"
          ? "/employee/settings"
          : "/council/settings";
  return { href, label: T.nav.settings, icon: Settings };
}

function pageTitles(): Record<string, string> {
  return {
    "/audit/dashboard": T.nav.dashboard,
    "/audit/settings": T.nav.settings,
    "/audit/notifications": T.nav.notifications,
    "/audit/analytics": T.nav.analytics,
    "/audit/recommendations/new": T.create.title,
    "/audit/recommendations": T.register.title,
    "/audit/reports/new": T.reports.create,
    "/audit/reports": T.nav.reports,
    "/audit/followup-reports": T.nav.followups,
    "/audit/assistant": T.nav.assistant,
    "/department/dashboard": T.nav.dashboard,
    "/department/settings": T.nav.settings,
    "/department/notifications": T.nav.notifications,
    "/department/analytics": T.nav.analytics,
    "/department/recommendations": T.nav.recommendations,
    "/department/team-progress": T.nav.teamProgress,
    "/department/assistant": T.nav.assistant,
    "/employee/my-tasks": T.nav.dashboard,
    "/employee/recommendations": T.dashboard.myRecommendations,
    "/employee/settings": T.nav.settings,
    "/employee/notifications": T.nav.notifications,
    "/employee/analytics": T.nav.analytics,
    "/employee/assistant": T.nav.assistant,
    "/council/pending-approvals": T.nav.pendingApprovals,
    "/council/settings": T.nav.settings,
    "/council/notifications": T.nav.notifications,
    "/council/analytics": T.nav.analytics,
    "/council/closure-reviews": T.nav.closureReviews,
    "/council/approved-history": T.nav.approvedHistory,
    "/council/followup-reports": T.nav.followups,
    "/council/recommendations": T.nav.recommendations,
    "/council/assistant": T.nav.assistant,
  };
}

function pageTitle(pathname: string) {
  const titles = pageTitles();
  const exact = titles[pathname];
  if (exact) return exact;
  const match = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.startsWith(key));
  return match ? titles[match] : T.appName;
}

function searchBase(role: Role) {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/my-tasks";
  return "/council/recommendations";
}

function splitHref(href: string) {
  const q = href.indexOf("?");
  if (q === -1) return { path: href, params: new URLSearchParams() };
  return { path: href.slice(0, q), params: new URLSearchParams(href.slice(q + 1)) };
}

function navItemActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const { path, params } = splitHref(href);
  if (href.endsWith("/new")) return pathname === href;

  const onPath = pathname === path || (pathname.startsWith(`${path}/`) && !pathname.endsWith("/new"));
  if (!onPath) return false;

  const keys = [...params.keys()];
  if (!keys.length) {
    const stage = searchParams.get("stage");
    const status = searchParams.get("status");
    if (pathname === path && (stage || status)) return false;
    return true;
  }
  return keys.every((key) => searchParams.get(key) === params.get(key));
}

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
    <div className="relative min-w-0 flex-1 max-w-2xl" ref={boxRef}>
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
        className="h-10 w-full rounded-(--radius-field) border border-line bg-subtle py-2 ps-10 pe-[4.5rem] text-sm outline-none transition-colors placeholder:text-muted focus:border-primary focus:bg-elevated focus:ring-2 focus:ring-primary/20"
        aria-label={T.nav.search}
      />
      <kbd className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">
        {T.nav.searchShortcut}
      </kbd>
      {open && debounced.length >= 2 ? (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-(--radius-dialog) border border-line bg-elevated shadow-(--shadow-float)">
          <p className="bg-subtle px-3 py-1.5 text-[11px] font-medium text-ink-soft">{T.nav.recommendations}</p>
          {results.length ? (
            <ul>
              {results.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${base}/${item.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                    className="block px-3 py-2.5 transition-colors hover:bg-primary-light"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium text-primary-dark" dir="ltr">
                        REC-{String(item.id).padStart(4, "0")}
                      </span>
                      <StatusBadge status={item.status} />
                    </span>
                    <span className="mt-1 line-clamp-1 block text-sm text-ink">{caseTitle(item.text, 80)}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {role === "department_head"
                        ? item.responsible_employee || item.report_title
                        : `${item.department_name}${item.responsible_employee ? ` · ${item.responsible_employee}` : ""}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-center text-sm text-ink-soft">{T.empty.search}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SidebarNav({
  role,
  pathname,
  collapsed,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  useI18n();
  const searchParams = useSearchParams();
  const settings = settingsFor(role);
  const groups = navFor(role);

  const itemCls = (active: boolean) =>
    cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
      collapsed && "justify-center px-2",
      active
        ? "bg-primary/25 font-medium text-sidebar-text"
        : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
    );

  return (
    <>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className={cn(groupIndex > 0 && "mt-4")}>
            {group.label && !collapsed ? (
              <p className="mb-1 px-3 text-[11px] font-semibold text-sidebar-muted">
                {group.label}
              </p>
            ) : null}
            {group.label && collapsed ? (
              <span aria-hidden className="mx-auto mb-2 block h-px w-6 bg-sidebar-muted/30" />
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = navItemActive(pathname, searchParams, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavigate}
                    className={itemCls(active)}
                  >
                    {active ? (
                      <span className="absolute inset-y-2 start-0 w-[3px] rounded-e bg-primary" aria-hidden />
                    ) : null}
                    <Icon className="size-[18px] shrink-0" />
                    {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-white/10 px-2 py-3">
        <Link
          href={settings.href}
          title={collapsed ? settings.label : undefined}
          onClick={onNavigate}
          className={itemCls(pathname === settings.href || pathname.startsWith(`${settings.href}/`))}
        >
          {pathname === settings.href || pathname.startsWith(`${settings.href}/`) ? (
            <span className="absolute inset-y-2 start-0 w-[3px] rounded-e bg-primary" aria-hidden />
          ) : null}
          <settings.icon className="size-[18px] shrink-0" />
          {collapsed ? <span className="sr-only">{settings.label}</span> : settings.label}
        </Link>
        <button
          type="button"
          onClick={logout}
          title={collapsed ? T.nav.logout : undefined}
          className={cn(itemCls(false), "w-full")}
        >
          <LogOut className="size-[18px] shrink-0" />
          {collapsed ? <span className="sr-only">{T.nav.logout}</span> : T.nav.logout}
        </button>
      </div>
    </>
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
    // localStorage is only readable client-side; syncing it into state after
    // mount is the standard auth-gate pattern and cannot cascade (runs once).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(auth.user);
    setChecked(true);
  }, [role, router]);

  if (!checked || !user) return null;

  return (
    <ShellFrame role={role} user={user} pathname={pathname}>
      {children}
    </ShellFrame>
  );
}

function ShellFrame({
  role,
  user,
  pathname,
  children,
}: {
  role: Role;
  user: User;
  pathname: string;
  children: ReactNode;
}) {
  useI18n();
  usePrefetchAIInsights(role);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("audit_sidebar_collapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem("audit_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  const sidebar = (
    <>
      <div className={cn("border-b border-white/10 px-4 py-4", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <MunicipalLogo size="sm" inverted />
          {collapsed ? null : (
            <div className="min-w-0">
              <p className="font-heading text-sm font-bold leading-snug text-sidebar-text">{T.appName}</p>
              <p className="truncate text-[11px] text-sidebar-muted">
                {ROLE_LABELS[user.role]}
                {user.municipality_name ? ` · ${user.municipality_name}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
      <SidebarNav role={role} pathname={pathname} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
    </>
  );

  const initials = (user.full_name_ar || user.username).slice(0, 1);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-e border-line bg-sidebar text-sidebar-text md:flex",
          collapsed ? "w-[72px]" : "w-60"
        )}
      >
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-overlay" aria-label={T.nav.close} onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col bg-sidebar text-sidebar-text shadow-(--shadow-float)">
            <button
              className="absolute end-3 top-3 rounded p-1 text-sidebar-muted hover:bg-sidebar-hover"
              onClick={() => setMobileOpen(false)}
              aria-label={T.nav.close}
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 md:gap-3 md:px-5">
          <button
            className="rounded-(--radius-btn) p-2 text-ink-soft hover:bg-subtle md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={T.nav.menu}
          >
            <Menu className="size-5" />
          </button>
          <button
            className="hidden rounded-(--radius-btn) p-2 text-ink-soft hover:bg-subtle md:inline-flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? T.nav.expand : T.nav.collapse}
          >
            <DirCollapse collapsed={collapsed} className="size-5" />
          </button>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate font-heading text-sm font-semibold text-navy">{T.appName}</p>
            <p className="truncate text-[11px] text-muted">{pageTitle(pathname)}</p>
          </div>
          <GlobalSearch role={role} />
          <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <NotificationBell role={role} />
            <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-light font-heading text-[13px] font-semibold text-primary-dark ring-2 ring-primary/15">
                {initials}
              </span>
              <div className="hidden min-w-0 xl:block">
                <p className="truncate font-heading text-[13.5px] font-semibold leading-snug text-navy">
                  {user.full_name_ar || user.username}
                </p>
                <p className="mt-0.5 inline-block max-w-full truncate rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[86rem] flex-1 px-4 py-4 md:px-5">{children}</main>
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
  return (
    <Suspense fallback={null}>
      <ShellInner role={role}>{children}</ShellInner>
    </Suspense>
  );
}
