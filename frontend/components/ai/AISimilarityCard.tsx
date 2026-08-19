"use client";

import Link from "next/link";

import type { AIMatch } from "@/lib/types";
import { STATUS_LABELS, T, useI18n } from "@/lib/i18n";

function firstLine(value: string) {
  const line = (value || "").split(/\r?\n/).find((part) => part.trim()) ?? "";
  return line.replace(/^(العنوان|الوضع القائم|المعيار|الأثر|التوصية|الهدف):\s*/, "").trim();
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
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs" dir="ltr">
          {match.matched_reference}
        </span>
        <span className="font-mono text-xs" dir="ltr">
          {match.similarity_percent}%
        </span>
      </div>
      {title ? <p className="mt-1 line-clamp-2 leading-relaxed">{title}</p> : null}
      <p className="mt-1 text-xs text-ink-soft">
        {match.matched_department}
        {status ? ` · ${status}` : ""}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {match.suggested_recurring === "LIKELY_RECURRING" ? T.ai.recurringLikely : T.ai.recurringRelated}
      </p>
      {match.reasons.length ? (
        <ul className="mt-1 text-xs text-ink-soft">
          {match.reasons.slice(0, 3).map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      ) : null}
    </>
  );

  return (
    <div className="rounded border border-ai/20 bg-ai-light/40 p-2 text-sm">
      {href ? (
        <Link href={href} className="block hover:text-primary">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
