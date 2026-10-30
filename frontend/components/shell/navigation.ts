/**
 * The role navigation, shared by the desktop sidebar, the tablet rail and the
 * phone's bottom navigation + "More" sheet. Only routes the backend serves
 * for the role appear here.
 */
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  History,
  LayoutDashboard,
  LineChart,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ROLE_PROFILE } from "@/lib/api";
import type { NavCounts } from "@/lib/hooks";
import { T } from "@/lib/i18n";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Badge from /api/nav-counts/ (the viewer's own turn, or a council queue). */
  count?: keyof NavCounts;
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

/** Only routes the backend actually serves for this role appear here. */
export function navFor(role: Role): NavGroup[] {
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
          { href: "/audit/recommendations", label: T.nav.recommendations, icon: ClipboardList, count: "recommendations" },
          { href: "/audit/reports", label: T.nav.reports, icon: FileText, count: "reports" },
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
          { href: "/department/recommendations", label: T.register.title, icon: ClipboardList, count: "recommendations" },
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
        items: [
          {
            href: "/employee/recommendations",
            label: T.dashboard.myRecommendations,
            icon: ClipboardList,
            count: "recommendations",
          },
        ],
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
          { href: "/council/pending-approvals", label: T.nav.pendingApprovals, icon: ClipboardCheck, count: "pending_approvals" },
          { href: "/council/closure-reviews", label: T.nav.closureReviews, icon: ClipboardList, count: "closure_reviews" },
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

export function settingsFor(role: Role): NavItem {
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

export function profileHref(role: Role) {
  return ROLE_PROFILE[role];
}

export function pageTitles(): Record<string, string> {
  return {
    "/audit/dashboard": T.nav.dashboard,
    "/audit/profile": T.nav.profile,
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
    "/department/profile": T.nav.profile,
    "/department/settings": T.nav.settings,
    "/department/notifications": T.nav.notifications,
    "/department/analytics": T.nav.analytics,
    "/department/recommendations": T.nav.recommendations,
    "/department/team-progress": T.nav.teamProgress,
    "/department/assistant": T.nav.assistant,
    "/employee/my-tasks": T.nav.dashboard,
    "/employee/recommendations": T.dashboard.myRecommendations,
    "/employee/profile": T.nav.profile,
    "/employee/settings": T.nav.settings,
    "/employee/notifications": T.nav.notifications,
    "/employee/analytics": T.nav.analytics,
    "/employee/assistant": T.nav.assistant,
    "/council/pending-approvals": T.nav.pendingApprovals,
    "/council/profile": T.nav.profile,
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

export function pageTitle(pathname: string) {
  const titles = pageTitles();
  const exact = titles[pathname];
  if (exact) return exact;
  const match = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.startsWith(key));
  return match ? titles[match] : T.appName;
}

export function searchBase(role: Role) {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/my-tasks";
  return "/council/recommendations";
}

/** The role's register, where a search can show every match (BUG-21). */
export function registerSearchHref(role: Role, text: string) {
  const register =
    role === "audit"
      ? "/audit/recommendations"
      : role === "department_head"
        ? "/department/recommendations"
        : role === "employee"
          ? "/employee/recommendations"
          : "/council/recommendations";
  return `${register}?search=${encodeURIComponent(text.trim())}`;
}

export function splitHref(href: string) {
  const q = href.indexOf("?");
  if (q === -1) return { path: href, params: new URLSearchParams() };
  return { path: href.slice(0, q), params: new URLSearchParams(href.slice(q + 1)) };
}

export function navItemActive(pathname: string, searchParams: URLSearchParams, href: string) {
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


/** The phone's bottom tabs: the role's most used destinations (More holds the rest). */
export function mobileTabsFor(role: Role): NavItem[] {
  const tabs: Record<Role, NavItem[]> = {
    audit: [
      { href: "/audit/dashboard", label: T.mobile.tabs.home, icon: LayoutDashboard },
      { href: "/audit/recommendations", label: T.mobile.tabs.cases, icon: ClipboardList, count: "recommendations" },
      { href: "/audit/reports", label: T.mobile.tabs.reports, icon: FileText, count: "reports" },
      { href: "/audit/followup-reports", label: T.mobile.tabs.followups, icon: BarChart3 },
    ],
    department_head: [
      { href: "/department/dashboard", label: T.mobile.tabs.home, icon: LayoutDashboard },
      { href: "/department/recommendations", label: T.mobile.tabs.cases, icon: ClipboardList, count: "recommendations" },
      { href: "/department/team-progress", label: T.mobile.tabs.team, icon: Users },
    ],
    employee: [
      { href: "/employee/my-tasks", label: T.mobile.tabs.home, icon: LayoutDashboard },
      { href: "/employee/recommendations", label: T.mobile.tabs.myCases, icon: ClipboardList, count: "recommendations" },
      { href: "/employee/analytics", label: T.mobile.tabs.analytics, icon: LineChart },
    ],
    council: [
      { href: "/council/pending-approvals", label: T.mobile.tabs.approvals, icon: ClipboardCheck, count: "pending_approvals" },
      { href: "/council/closure-reviews", label: T.mobile.tabs.closures, icon: ClipboardList, count: "closure_reviews" },
      { href: "/council/recommendations", label: T.mobile.tabs.cases, icon: History },
    ],
  };
  return tabs[role];
}

/** Every top-level destination of the role (tabs, groups, settings, profile). */
export function topLevelPaths(role: Role): string[] {
  const paths = navFor(role).flatMap((group) => group.items.map((item) => splitHref(item.href).path));
  return [...paths, settingsFor(role).href, profileHref(role), `/${roleSegment(role)}/notifications`];
}

export function roleSegment(role: Role): string {
  return role === "department_head" ? "department" : role;
}

/** The nearest top-level page above a detail page (for the app bar's back). */
export function parentPath(role: Role, pathname: string): string {
  const candidates = topLevelPaths(role)
    .filter((path) => pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? navFor(role)[0].items[0].href;
}
