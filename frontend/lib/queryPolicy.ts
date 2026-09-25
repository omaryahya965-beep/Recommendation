"use client";

import type { QueryClient } from "@tanstack/react-query";

/**
 * Freshness policy for every server query, grouped by how fast the data
 * changes. One place, so the maximum stale period of each resource is
 * documented and reviewable rather than scattered across components.
 *
 * Query keys in use (prefix-matched by invalidation):
 *   ["recommendations", scope, params]  register lists / filtered views
 *   ["recommendation", id]              one case with its full timeline
 *   ["dashboard"]                       role action center (one per user)
 *   ["analytics", scope]                portfolio aggregates
 *   ["reports", ...] / ["report", id]   report register / one report
 *   ["pending-approvals"]               council ratification queue
 *   ["notifications", "unread"|"list"|"recent"]
 *   ["departments"], ["employees"], ["workflow-policy-public"], ["me"]
 *
 * The cache lives in memory only and is cleared on every sign-in, so a key
 * never needs the user id: one tab only ever holds one user's data.
 */

/**
 * Workflow state someone else can change: register lists and dashboards.
 * Shown instantly from cache on return, refreshed in the background when
 * older than a minute, on tab focus, and every two minutes while visible
 * (React Query pauses interval refetching in hidden tabs).
 * Max stale period for an open, visible page: ~2 minutes.
 */
export const LIVE = {
  staleTime: 60_000,
  refetchOnWindowFocus: true,
  refetchInterval: 2 * 60_000,
} as const;

/**
 * One recommendation's detail. No interval: the page hosts workflow forms
 * and it is re-fetched after every action taken here. Every transition is
 * re-validated server-side, so a stale view can never cause a wrong one.
 * Max stale period: 60 s after navigation, or until the tab regains focus.
 */
export const CASE = {
  staleTime: 60_000,
  refetchOnWindowFocus: true,
} as const;

/** Reports, analytics, follow-up reports: change with workflow milestones. */
export const MODERATE = { staleTime: 2 * 60_000 } as const;

/** Departments, employees, municipal policy: change rarely, admin-driven. */
export const REFERENCE = { staleTime: 10 * 60_000 } as const;

/** Keep recently visited pages in memory so going back renders instantly. */
export const GC_TIME = 30 * 60_000;

/**
 * Everything that shows recommendation state. Called after any mutation that
 * can move a recommendation (workflow action, report submission, council
 * ratification, recommendation creation).
 *
 * Invalidation only marks inactive queries stale; they refetch when next
 * shown. Reference data (departments, employees, policy) is left alone, and
 * so are other cases' detail queries unless `allCases` is set because the
 * mutation moved many recommendations at once.
 */
export function invalidateRecommendationViews(
  queryClient: QueryClient,
  options: { id?: number; reportId?: number; allCases?: boolean } = {}
) {
  const { id, reportId, allCases = false } = options;
  if (allCases) queryClient.invalidateQueries({ queryKey: ["recommendation"] });
  else if (id !== undefined) queryClient.invalidateQueries({ queryKey: ["recommendation", id] });
  queryClient.invalidateQueries({ queryKey: ["recommendations"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["analytics"] });
  queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
  if (reportId !== undefined) queryClient.invalidateQueries({ queryKey: ["report", reportId] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  // Transitions notify the actor's counterparts and sometimes the actor.
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}
