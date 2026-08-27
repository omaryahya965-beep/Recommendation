"use client";

import { Lock, Shield } from "lucide-react";
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
    <li className="relative flex gap-5 pb-7 last:pb-0">
      {/* Timestamp column */}
      <div className="flex w-[8rem] shrink-0 flex-col items-end pt-1 text-end">
        <time className="font-mono text-[12.5px] font-bold text-navy" dateTime={entry.created_at} dir="ltr">
          {formatDate(entry.created_at)}
        </time>
        <span className="font-mono text-[11px] text-muted" dir="ltr">
          {formatTime(entry.created_at)}
        </span>
      </div>

      {/* Timeline connector */}
      <div className="flex shrink-0 flex-col items-center">
        <span className={cn(
          "mt-1.5 flex size-3 items-center justify-center rounded-full ring-2",
          system
            ? "bg-subtle ring-line"
            : "bg-primary ring-primary/20"
        )} />
        {!isLast ? <span aria-hidden className="mt-1 w-0.5 flex-1 bg-line/60" /> : null}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-1">
        {/* User */}
        <p className="text-[13.5px] font-bold text-navy">
          {system ? T.trail.system : entry.user_full_name || entry.user}
        </p>
        {!system ? (
          <p className="text-[11.5px] font-medium text-muted">{ROLE_LABELS[entry.user_role] ?? entry.user_role}</p>
        ) : null}

        {/* Action */}
        <p className="mt-2 text-[13px] font-semibold text-ink">{TRAIL_ACTION_LABELS[entry.action] ?? entry.action}</p>

        {/* Transition badges */}
        {from && to ? (
          <div className="mt-2 inline-flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-subtle px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft border border-line">
              {STATUS_LABELS[from] ?? from}
            </span>
            <DirForward className="size-3 text-muted" />
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11.5px] font-bold text-primary-dark border border-primary/15">
              {STATUS_LABELS[to] ?? to}
            </span>
          </div>
        ) : null}

        {/* Detail text */}
        {detail ? (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink font-medium bg-subtle/50 rounded-lg p-2.5 border border-line/50">
            {detail}
          </p>
        ) : null}

        {/* Metadata expander */}
        {extras.length ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 text-[11.5px] font-bold text-primary-dark hover:underline"
            >
              {expanded ? T.trail.hideMetadata : T.trail.showMetadata}
            </button>
            {expanded ? (
              <dl className="mt-2 grid gap-x-4 gap-y-1.5 rounded-lg border border-line bg-subtle/50 p-3 text-[12px] sm:grid-cols-[auto_1fr]">
                {extras.map((key) => (
                  <div key={key} className="contents">
                    <dt className="font-mono font-bold text-muted" dir="ltr">
                      {key}
                    </dt>
                    <dd className="break-words text-ink font-medium">{String(metadata[key])}</dd>
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
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
        <h2 className="font-heading text-[17px] font-bold text-navy">{T.trail.official}</h2>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-[11.5px] font-semibold text-muted border border-line">
          <Shield className="size-3" aria-hidden />
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
