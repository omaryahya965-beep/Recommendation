"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AIDashboardInsights, Role } from "@/lib/types";

export function uiLanguage(): "ar" | "en" {
  if (typeof document === "undefined") return "ar";
  return document.documentElement.lang?.toLowerCase().startsWith("en") ? "en" : "ar";
}

export const AI_INSIGHTS_STALE_MS = 5 * 60_000;

export function aiInsightsQueryKey(role: Role, lang: string = uiLanguage()) {
  return ["ai-insights", role, lang] as const;
}

export function aiInsightsPath(lang: string = uiLanguage()) {
  return `/api/ai/dashboard/insights/?language=${encodeURIComponent(lang)}`;
}

/** Warm the insights cache as soon as any role page mounts. */
export function usePrefetchAIInsights(role: Role) {
  const lang = uiLanguage();
  useQuery({
    queryKey: aiInsightsQueryKey(role, lang),
    queryFn: () => api<AIDashboardInsights>(aiInsightsPath(lang)),
    staleTime: AI_INSIGHTS_STALE_MS,
    gcTime: 30 * 60_000,
    retry: false,
  });
}

