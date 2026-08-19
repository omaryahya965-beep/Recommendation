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
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[88px] rounded-(--radius-field)" />
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
        <p className="text-sm text-ink-soft">{data?.detail || T.ai.unavailable}</p>
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
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
                  "rounded-(--radius-field) border p-3 text-start transition-colors",
                  active ? "border-ai bg-ai text-on-inverse" : "border-ai/40 bg-surface hover:border-ai hover:bg-ai-light"
                )}
              >
                <span className={cn("flex items-center gap-1.5", active ? "text-on-inverse/90" : "text-ai-dark")}>
                  {card.icon}
                  <span className="text-[12px] font-medium leading-tight">{T.ai[card.label]}</span>
                </span>
                <span
                  className={cn("mt-1.5 block font-heading text-2xl font-bold", active ? "text-on-inverse" : "text-ink")}
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
        <p className="text-sm text-ink-soft">{isFetching ? T.ai.generating : T.ai.unavailable}</p>
      ) : null}

      {selected?.items.length ? (
        <div className="mt-4 border-t border-ai/20 pt-4">
          <h3 className="mb-2 font-heading text-sm font-semibold text-ai-dark">
            {selectedLabel ? T.ai[selectedLabel.label] : T.ai.intelligence}
            <span className="ms-2 font-mono text-xs text-muted" dir="ltr">
              {selected.count}
            </span>
          </h3>
          <RecommendationTable items={selected.items} detailHref={detailHref} />
        </div>
      ) : null}

      {data?.narratives?.length ? (
        <ul className="mt-4 space-y-1.5 border-t border-ai/20 pt-4 text-[13.5px] leading-relaxed text-ink">
          {data.narratives.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </AIPanel>
  );
}
