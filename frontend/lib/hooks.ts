"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, errorMessage } from "./api";
import { T } from "./i18n";
import type { AppNotification, Department, Paginated, RecommendationDetail, User, WorkflowPolicy } from "./types";

export function useRecommendation(id: number) {
  return useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => api<RecommendationDetail>(`/api/recommendations/${id}/`),
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
      queryClient.invalidateQueries({ queryKey: ["recommendation", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
    staleTime: 5 * 60_000,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Paginated<Department>>("/api/departments/"),
    staleTime: 5 * 60_000,
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
    staleTime: 5 * 60_000,
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api<Paginated<AppNotification>>("/api/notifications/?page_size=100"),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<{ unread: number }>("/api/notifications/unread-count/"),
    refetchInterval: 30_000,
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
