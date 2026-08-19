"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

import { DirForward } from "@/components/i18n/DirIcon";

import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/format";
import { ROLE_LABELS, STATUS_LABELS, T, TRAIL_ACTION_LABELS, useI18n } from "@/lib/i18n";
import type { TrailEntry } from "@/lib/types";

const TRANSITION_KEYS = new Set(["from_status", "to_status", "system"]);

function detailText(metadata: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (TRANSITION_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object") continue;
    parts.push(String(value));
  }
  return parts.length ? parts.join(" — ") : null;
}

function TrailRow({ entry, isLast }: { entry: TrailEntry; isLast: boolean }) {
  useI18n();
  const [expanded, setExpanded] = useState(false);
  const metadata = entry.metadata ?? {};
  const from = metadata.from_status as string | undefined;
  const to = metadata.to_status as string | undefined;
  const system = metadata.system === true;
  const detail = detailText(metadata);
  const extras = Object.keys(metadata).filter((key) => !TRANSITION_KEYS.has(key));

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <div className="flex w-[7.5rem] shrink-0 flex-col items-end pt-0.5 text-end">
        <time className="font-mono text-[13px] font-medium text-navy" dateTime={entry.created_at} dir="ltr">
          {formatDate(entry.created_at)}
        </time>
        <span className="font-mono text-[11px] text-muted" dir="ltr">
          {formatTime(entry.created_at)}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-center">
        <span className={cn("mt-1.5 size-2.5 rounded-full", system ? "bg-line" : "bg-primary")} />
        {!isLast ? <span aria-hidden className="mt-1 w-px flex-1 bg-line" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">
          {system ? T.trail.system : entry.user_full_name || entry.user}
        </p>
        {!system ? (
          <p className="text-[12px] text-ink-soft">{ROLE_LABELS[entry.user_role] ?? entry.user_role}</p>
        ) : null}

        <p className="mt-2 text-sm text-navy">{TRAIL_ACTION_LABELS[entry.action] ?? entry.action}</p>

        {from && to ? (
          <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
            <span>{STATUS_LABELS[from] ?? from}</span>
            <DirForward className="size-3" />
            <span className="font-medium text-ink">{STATUS_LABELS[to] ?? to}</span>
          </p>
        ) : null}

        {detail ? <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{detail}</p> : null}

        {extras.length ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-1.5 text-xs font-medium text-primary-dark hover:underline"
            >
              {expanded ? T.trail.hideMetadata : T.trail.showMetadata}
            </button>
            {expanded ? (
              <dl className="mt-1.5 grid gap-x-3 gap-y-1 border border-line bg-subtle/50 p-2.5 text-xs sm:grid-cols-[auto_1fr]">
                {extras.map((key) => (
                  <div key={key} className="contents">
                    <dt className="font-mono text-muted" dir="ltr">
                      {key}
                    </dt>
                    <dd className="break-words text-ink">{String(metadata[key])}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Official chronological record. Visually distinct from AI output: navy
 * markers, timestamps first, no purple.
 */
export function AuditTrail({ entries }: { entries: TrailEntry[] }) {
  useI18n();
  const ordered = [...(entries ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h2 className="font-heading text-base font-semibold text-navy">{T.trail.official}</h2>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" />
          {T.trail.intro}
        </p>
      </header>

      {ordered.length ? (
        <ol>{ordered.map((entry, index) => (
          <TrailRow key={entry.id} entry={entry} isLast={index === ordered.length - 1} />
        ))}</ol>
      ) : (
        <EmptyState title={T.trail.empty} className="border-dashed shadow-none" />
      )}
    </section>
  );
}
