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
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-base font-semibold text-navy">{T.case.whyExists}</h2>
        {actions}
      </header>

      {parsed.structured ? (
        <div className="space-y-5">
          {parsed.preamble ? (
            <p className="whitespace-pre-wrap text-sm leading-[1.9] text-ink">{parsed.preamble}</p>
          ) : null}
          {parsed.sections.map((section) => (
            <ProseBlock key={section.id} label={section.heading}>
              {section.body}
            </ProseBlock>
          ))}
        </div>
      ) : parsed.preamble ? (
        <p className="whitespace-pre-wrap text-sm leading-[1.9] text-ink">{parsed.preamble}</p>
      ) : (
        <EmptyState icon={<ScrollText className="size-6" />} title={T.empty.generic} className="border-dashed shadow-none" />
      )}

      {rec.root_cause?.trim() ? (
        <section className="border-t border-line pt-5">
          <h3 className="mb-2 text-xs font-semibold text-muted">{T.case.rootCause}</h3>
          <p className="whitespace-pre-wrap text-sm leading-[1.9] text-ink">{rec.root_cause}</p>
        </section>
      ) : null}

      {rec.is_recurring ? (
        <Callout
          tone={rec.recurrence_confirmed ? "danger" : "warning"}
          icon={<Repeat2 className="size-4" />}
          title={rec.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
        >
          {rec.similar_recommendation_text ? (
            <p className="leading-relaxed">
              {T.case.recurrenceOf}{" "}
              <span className="font-mono" dir="ltr">
                REC-{String(rec.similar_recommendation).padStart(4, "0")}
              </span>
              : {rec.similar_recommendation_text}
            </p>
          ) : null}
          {typeof rec.similarity_score === "number" ? (
            <p className="mt-1 text-xs">
              {T.case.similarity}: <span dir="ltr">{Math.round(rec.similarity_score * 100)}%</span>
            </p>
          ) : null}
        </Callout>
      ) : null}
    </article>
  );
}
