"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { AIJob } from "@/lib/types";

/**
 * Single container for every AI surface in the product. The purple edge and the
 * permanent advisory notice are what separate advisory output from the official
 * record, so no AI content should be rendered outside this wrapper.
 */
export function AIPanel({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useI18n();
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-ai/25 bg-ai-light/10 shadow-sm relative",
        className
      )}
    >
      <div className="absolute top-0 start-0 w-1 bg-ai h-full" aria-hidden />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ai/10 bg-ai-light/30 px-5 py-3 md:px-6">
        <h2 className="inline-flex items-center gap-2 font-heading text-[15px] font-bold text-ai-dark">
          <Sparkles className="size-4 shrink-0 animate-pulse text-ai" aria-hidden />
          {title}
        </h2>
        {actions}
      </header>
      <div className="p-5 md:p-6">{children}</div>
      <p className="border-t border-ai/10 bg-ai-light/20 px-5 py-2.5 text-[11.5px] font-semibold text-ai-dark md:px-6 tracking-wide">
        {T.ai.notOfficial}
      </p>
    </section>
  );
}

export function AIConfidenceBadge({ value }: { value: number | null | undefined }) {
  useI18n();
  if (value == null) return null;
  const tone =
    value >= 75
      ? "text-success-dark bg-success-light ring-success/20"
      : value >= 50
        ? "text-warning-dark bg-warning-light ring-warning/20"
        : "text-danger-dark bg-danger-light ring-danger/20";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ring-1 ${tone}`} dir="ltr">
      {T.ai.confidence} {Math.round(value)}%
    </span>
  );
}

export function AIJobStatus({ job, busy }: { job?: AIJob | null; busy?: boolean }) {
  useI18n();
  if (busy || job?.status === "running" || job?.status === "pending") {
    return <p className="text-xs font-bold text-ai-dark flex items-center gap-2">
      <span className="size-2 rounded-full bg-ai animate-ping" />
      {T.ai.generating}
    </p>;
  }
  if (job?.status === "failed") {
    return <p className="text-xs font-semibold text-danger-dark bg-danger-light/50 px-2 py-1 rounded border border-danger/25">{job.error || T.common.error}</p>;
  }
  return null;
}

export function AIMeta({
  provider,
  model,
  createdAt,
}: {
  provider?: string;
  model?: string;
  createdAt?: string;
}) {
  useI18n();
  return (
    <p className="mt-3 text-[11.5px] font-semibold text-ink-soft">
      {T.ai.advisory} · {T.ai.model}: <span className="font-mono text-navy" dir="ltr">{model || provider || "—"}</span>
      {createdAt ? (
        <>
          {" "}
          · {T.ai.generated}: <time className="font-mono text-muted" dir="ltr">{new Date(createdAt).toLocaleString("en-GB")}</time>
        </>
      ) : null}
    </p>
  );
}

export function ScoreRow({ label, value }: { label: string; value: number | string }) {
  useI18n();
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] border-b border-line/45 py-2 last:border-b-0">
      <span className="text-ink-soft font-semibold">{label}</span>
      <span className="font-mono font-bold text-navy" dir="ltr">
        {typeof value === "number" ? `${value}%` : value}
      </span>
    </div>
  );
}
