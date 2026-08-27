"use client";

import { Repeat2, ScrollText } from "lucide-react";

import { Callout, ProseBlock } from "@/components/ui/Base";
import { EmptyState } from "@/components/ui/EmptyState";
import { parseFinding } from "@/lib/finding";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";

/**
 * The audit working paper: labelled sections as a continuous record, not a
 * stack of cards. Unstructured historical text still renders as prose.
 */
export function FindingSection({
  rec,
  actions,
}: {
  rec: RecommendationDetail;
  actions?: React.ReactNode;
}) {
  useI18n();
  const parsed = parseFinding(rec.text);

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h2 className="font-heading text-[16px] font-bold text-navy">{T.case.whyExists}</h2>
        {actions}
      </header>

      {parsed.structured ? (
        <div className="space-y-5">
          {parsed.preamble ? (
            <p className="whitespace-pre-wrap text-sm leading-[1.8] text-ink font-medium bg-subtle/30 rounded-xl p-4 border border-line">{parsed.preamble}</p>
          ) : null}
          <div className="grid gap-4">
            {parsed.sections.map((section) => (
              <ProseBlock key={section.id} label={section.heading} className="bg-surface rounded-xl p-4 border border-line/60 shadow-sm">
                {section.body}
              </ProseBlock>
            ))}
          </div>
        </div>
      ) : parsed.preamble ? (
        <p className="whitespace-pre-wrap text-sm leading-[1.8] text-ink font-medium bg-subtle/30 rounded-xl p-4 border border-line">{parsed.preamble}</p>
      ) : (
        <EmptyState icon={<ScrollText className="size-8" />} title={T.empty.generic} className="border-dashed shadow-none py-10" />
      )}

      {rec.root_cause?.trim() ? (
        <section className="border-t border-line pt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{T.case.rootCause}</h3>
          <p className="whitespace-pre-wrap text-sm leading-[1.8] text-ink font-medium bg-subtle/30 rounded-xl p-4 border border-line">{rec.root_cause}</p>
        </section>
      ) : null}

      {rec.is_recurring ? (
        <Callout
          tone={rec.recurrence_confirmed ? "danger" : "warning"}
          icon={<Repeat2 className="size-4.5" />}
          title={rec.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
          className="shadow-sm border-s-4"
        >
          {rec.similar_recommendation_text ? (
            <p className="leading-relaxed text-[13px] font-medium">
              {T.case.recurrenceOf}{" "}
              <span className="font-mono font-bold" dir="ltr">
                REC-{String(rec.similar_recommendation).padStart(4, "0")}
              </span>
              : {rec.similar_recommendation_text}
            </p>
          ) : null}
          {typeof rec.similarity_score === "number" ? (
            <p className="mt-1.5 text-xs font-bold">
              {T.case.similarity}: <span className="font-mono" dir="ltr">{Math.round(rec.similarity_score * 100)}%</span>
            </p>
          ) : null}
        </Callout>
      ) : null}
    </article>
  );
}
