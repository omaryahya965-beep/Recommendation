"use client";

import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import type { AIMatch } from "@/lib/types";
import { STATUS_LABELS, T, useI18n } from "@/lib/i18n";

function firstLine(value: string) {
  const line = (value || "").split(/\r?\n/).find((part) => part.trim()) ?? "";
  return line.replace(/^(العنوان|الوضع القائم|المعيار|الأثر|التوصية|الهدف):\s*/, "").trim();
}

function similarityColor(percent: number) {
  if (percent >= 80) return "bg-danger/10 text-danger-dark border-danger/20";
  if (percent >= 65) return "bg-warning/10 text-warning-dark border-warning/20";
  return "bg-ai-light/40 text-ai-dark border-ai/20";
}

export function AISimilarityCard({
  match,
  href,
}: {
  match: AIMatch;
  href?: string;
}) {
  useI18n();
  const title = match.matched_title || firstLine(match.matched_text);
  const status = match.matched_status_label || STATUS_LABELS[match.matched_status] || match.matched_status;

  const inner = (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-ink-soft" dir="ltr">
          {match.matched_reference}
        </span>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${similarityColor(match.similarity_percent)}`} dir="ltr">
          {match.similarity_percent}%
        </span>
      </div>

      {/* Title */}
      {title ? (
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-navy">{title}</p>
      ) : null}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-ink-soft">
        {match.matched_department && <span>{match.matched_department}</span>}
        {status && (
          <>
            <span className="text-ink-soft/40">·</span>
            <span>{status}</span>
          </>
        )}
      </div>

      {/* Recurrence label */}
      <p className="text-[11px] font-bold uppercase tracking-wider text-ai-dark/70">
        {match.suggested_recurring === "LIKELY_RECURRING" ? T.ai.recurringLikely : T.ai.recurringRelated}
      </p>

      {/* Reasons */}
      {match.reasons.length ? (
        <ul className="space-y-1">
          {match.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex gap-1.5 text-[11.5px] text-ink-soft font-medium">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ai-dark/40" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Link indicator */}
      {href && (
        <div className="flex items-center gap-1 text-[11px] font-bold text-primary-dark">
          <span>{T.common.details}</span>
          <ArrowUpRight className="size-3" aria-hidden />
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-ai/15 bg-gradient-to-br from-ai-light/30 to-surface/80 p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md">
      {href ? (
        <Link href={href} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
