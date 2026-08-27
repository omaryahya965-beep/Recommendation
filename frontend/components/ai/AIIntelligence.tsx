"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, FileWarning, Repeat2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { AIPanel } from "@/components/ai/AIPrimitives";
import { RecommendationTable } from "@/components/RecommendationTable";
import { Skeleton } from "@/components/ui/EmptyState";
import { aiInsightsPath, aiInsightsQueryKey, AI_INSIGHTS_STALE_MS, uiLanguage } from "@/lib/ai";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { AIDashboardInsights, RecommendationListItem, Role } from "@/lib/types";

const CARD_META: Array<{ key: string; label: keyof typeof T.ai; icon: ReactNode }> = [
  { key: "high_risk", label: "highRisk", icon: <AlertTriangle className="size-4" /> },
  { key: "likely_delayed", label: "likelyDelayed", icon: <Clock className="size-4" /> },
  { key: "recurring", label: "recurringFindings", icon: <Repeat2 className="size-4" /> },
  { key: "evidence_concerns", label: "evidenceConcerns", icon: <FileWarning className="size-4" /> },
];

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

export function AIIntelligence({
  role,
  detailHref,
}: {
  role: Role;
  detailHref: (item: RecommendationListItem) => string;
}) {
  useI18n();
  const lang = uiLanguage();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: aiInsightsQueryKey(role, lang),
    queryFn: () => api<AIDashboardInsights>(aiInsightsPath(lang)),
    staleTime: AI_INSIGHTS_STALE_MS,
    gcTime: 30 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  if (isError || (data && !data.available && !isLoading)) {
    return (
      <AIPanel title={T.ai.intelligence}>
        <p className="text-sm font-semibold text-ink-soft">{data?.detail || T.ai.unavailable}</p>
      </AIPanel>
    );
  }

  const selected = open && data?.cards ? data.cards[open] : null;
  const selectedLabel = CARD_META.find((card) => card.key === open);
  const liveCards = CARD_META.filter((card) => (data?.cards?.[card.key]?.count ?? 0) > 0);
  const showSkeleton = isLoading && !data;

  return (
    <AIPanel title={T.ai.intelligence}>
      {showSkeleton ? <InsightsSkeleton /> : null}

      {!showSkeleton && liveCards.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {liveCards.map((card) => {
            const bucket = data?.cards?.[card.key];
            const count = bucket?.count ?? 0;
            const active = open === card.key;
            return (
              <button
                key={card.key}
                type="button"
                aria-pressed={active}
                onClick={() => setOpen((prev) => (prev === card.key ? null : card.key))}
                className={cn(
                  "min-h-16 rounded-xl border p-4 text-start shadow-sm",
                  active
                    ? "border-ai bg-ai text-white ring-4 ring-ai/20"
                    : "border-ai/20 bg-surface hover:border-ai hover:bg-ai-light/30"
                )}
              >
                <span className={cn("flex items-center gap-1.5", active ? "text-white/90" : "text-ai-dark")}>
                  {card.icon}
                  <span className="text-[13px] font-bold leading-tight">{T.ai[card.label]}</span>
                </span>
                <span
                  className={cn("mt-2.5 block font-heading text-2xl font-bold leading-none tracking-tight", active ? "text-white" : "text-navy")}
                  dir="ltr"
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!showSkeleton && !liveCards.length && !data?.narratives?.length ? (
        <p className="text-sm font-semibold text-ink-soft">{isFetching ? T.ai.generating : T.ai.unavailable}</p>
      ) : null}

      {selected?.items.length ? (
        <div className="mt-5 border-t border-ai/15 pt-5 animate-scale-in">
          <h3 className="mb-3 font-heading text-sm font-bold text-navy flex items-center gap-2">
            <span className="h-3 w-1 rounded-full bg-ai" aria-hidden />
            {selectedLabel ? T.ai[selectedLabel.label] : T.ai.intelligence}
            <span className="flex size-5 items-center justify-center rounded-full bg-subtle font-mono text-[11px] font-bold text-ink-soft" dir="ltr">
              {selected.count}
            </span>
          </h3>
          <RecommendationTable items={selected.items} detailHref={detailHref} />
        </div>
      ) : null}

      {data?.narratives?.length ? (
        <ul className="mt-5 space-y-2.5 border-t border-ai/15 pt-5 text-[13.5px] leading-relaxed text-ink font-medium">
          {data.narratives.map((line) => (
            <li key={line} className="flex gap-2 bg-ai-light/20 rounded-xl p-3 border border-ai/5 shadow-sm">
              <span className="mt-2.5 size-2 shrink-0 rounded-full bg-ai animate-pulse" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </AIPanel>
  );
}
