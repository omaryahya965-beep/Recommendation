"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "./api";
import { T } from "./i18n";
import { CASE, LIVE, REFERENCE, invalidateRecommendationViews } from "./queryPolicy";
import type {
  AppNotification,
  DashboardData,
  Department,
  Paginated,
  RecommendationDetail,
  User,
  WorkflowPolicy,
} from "./types";

function recommendationQuery(id: number) {
  return {
    queryKey: ["recommendation", id] as const,
    queryFn: () => api<RecommendationDetail>(`/api/recommendations/${id}/`),
    ...CASE,
  };
}

export function useRecommendation(id: number) {
  return useQuery(recommendationQuery(id));
}

/**
 * Hover/focus handlers that warm the detail cache when the user shows intent
 * to open a case. The short delay skips rows the pointer merely passes over;
 * prefetchQuery is a no-op while the cached copy is still fresh.
 */
export function usePrefetchRecommendation() {
  const queryClient = useQueryClient();
  const timer = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return useCallback(
    (id: number) => ({
      onMouseEnter: () => {
        cancel();
        timer.current = window.setTimeout(() => {
          void queryClient.prefetchQuery(recommendationQuery(id));
        }, 200);
      },
      onMouseLeave: cancel,
      onFocus: () => void queryClient.prefetchQuery(recommendationQuery(id)),
    }),
    [queryClient, cancel]
  );
}

/** The role's action center. One key for every page that shows it. */
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard/"),
    ...LIVE,
  });
}

export interface WorkflowActionInput {
  path: string;
  body?: unknown;
  formData?: FormData;
  successMessage?: string;
}

/**
 * Posts to one of the recommendation workflow endpoints and refreshes every
 * view that depends on case state.
 */
export function useWorkflowAction(id: number) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ path, body, formData }: WorkflowActionInput) =>
      api(`/api/recommendations/${id}/${path}`, { method: "POST", body, formData }),
    onSuccess: (_data, variables) => {
      setError(null);
      setSuccess(variables.successMessage ?? T.common.actionRecorded);
      const reportId = queryClient.getQueryData<RecommendationDetail>(["recommendation", id])?.report;
      invalidateRecommendationViews(queryClient, { id, reportId });
      window.setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err) => {
      setSuccess(null);
      setError(errorMessage(err));
    },
  });

  return { mutation, error, success, clearError: () => setError(null) };
}

export type WorkflowAction = ReturnType<typeof useWorkflowAction>;

export function useWorkflowPolicy() {
  return useQuery({
    queryKey: ["workflow-policy-public"],
    queryFn: () => api<WorkflowPolicy>("/api/workflow-policy/").catch(() => null),
    retry: false,
    ...REFERENCE,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Paginated<Department>>("/api/departments/"),
    ...REFERENCE,
  });
}

/** Employees assignable as action-plan owners. Audit and heads only. */
export function useEmployees(enabled = true) {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const data = await api<Paginated<User> | User[]>("/api/employees/");
      return Array.isArray(data) ? data : data.results;
    },
    enabled,
    ...REFERENCE,
  });
}

/**
 * The notification list (up to 100 rows, ~60 KB). Fetched only where it is
 * shown — the notification center page, or the bell while its panel is open —
 * never as a background poll on every page.
 */
const notificationListQuery = {
  queryKey: ["notifications", "list"] as const,
  queryFn: () => api<Paginated<AppNotification>>("/api/notifications/?page_size=100"),
  staleTime: 30_000,
};

export function useNotifications(enabled = true) {
  return useQuery({ ...notificationListQuery, enabled, refetchInterval: 60_000 });
}

/** Warms the list when the pointer reaches the bell, so opening it is instant. */
export function usePrefetchNotifications() {
  const queryClient = useQueryClient();
  return useCallback(() => void queryClient.prefetchQuery(notificationListQuery), [queryClient]);
}

/**
 * The only notification poll that runs on every page: a 14-byte count.
 * Paused while the tab is hidden (React Query default) and refreshed as soon
 * as the user returns to it.
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<{ unread: number }>("/api/notifications/unread-count/"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/api/notifications/${id}/mark-read/`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/notifications/mark-all-read/", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/api/notifications/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/**
 * A server-paginated list that loads further pages on request. Lists used to
 * ask for page_size=100 and silently drop everything after it; this keeps
 * the total from the API (`count`) and shows how many are loaded.
 */
export function usePagedList<T>(
  queryKey: readonly unknown[],
  path: string,
  options: { pageSize?: number; enabled?: boolean; live?: boolean } = {}
) {
  const { pageSize = 25, enabled = true, live = true } = options;
  const query = useInfiniteQuery({
    queryKey: [...queryKey, pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<Paginated<T>>(`${path}${path.includes("?") ? "&" : "?"}page=${pageParam}&page_size=${pageSize}`),
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    enabled,
    ...(live ? LIVE : {}),
  });
  const items = query.data?.pages.flatMap((page) => page.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;
  return { ...query, items, total };
}
