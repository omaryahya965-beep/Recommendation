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
        "overflow-hidden rounded-(--radius-card) border border-ai/25 bg-ai-light/25 shadow-(--shadow-card)",
        className
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ai/20 bg-ai-light/60 px-4 py-2.5 md:px-5">
        <h2 className="inline-flex items-center gap-2 font-heading text-[15px] font-semibold text-ai-dark">
          <Sparkles className="size-4" aria-hidden />
          {title}
        </h2>
        {actions}
      </header>
      <div className="p-4 md:p-5">{children}</div>
      <p className="border-t border-ai/20 bg-ai-light/40 px-4 py-2 text-[11.5px] font-medium text-ai-dark md:px-5">
        {T.ai.notOfficial}
      </p>
    </section>
  );
}

export function AIConfidenceBadge({ value }: { value: number | null | undefined }) {
  useI18n();
  if (value == null) return null;
  const tone =
    value >= 75 ? "text-success-dark bg-success-light" : value >= 50 ? "text-warning-dark bg-warning-light" : "text-danger-dark bg-danger-light";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] ${tone}`} dir="ltr">
      {T.ai.confidence} {Math.round(value)}%
    </span>
  );
}

export function AIJobStatus({ job, busy }: { job?: AIJob | null; busy?: boolean }) {
  useI18n();
  if (busy || job?.status === "running" || job?.status === "pending") {
    return <p className="text-xs text-ai-dark">{T.ai.generating}</p>;
  }
  if (job?.status === "failed") {
    return <p className="text-xs text-danger-dark">{job.error || T.common.error}</p>;
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
    <p className="mt-2 text-[11px] text-ink-soft">
      {T.ai.advisory} · {T.ai.model}: <span dir="ltr">{model || provider || "—"}</span>
      {createdAt ? (
        <>
          {" "}
          · {T.ai.generated}: <time dir="ltr">{new Date(createdAt).toLocaleString("en-GB")}</time>
        </>
      ) : null}
    </p>
  );
}

export function ScoreRow({ label, value }: { label: string; value: number | string }) {
  useI18n();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className="font-mono font-medium" dir="ltr">
        {typeof value === "number" ? `${value}%` : value}
      </span>
    </div>
  );
}

