import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export function EmptyState({
  title,
  description,
  icon,
  actions,
  className,
  compact = false,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  useI18n();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-line border-dashed bg-surface text-center transition-all",
        compact ? "px-6 py-8" : "px-8 py-14",
        className
      )}
    >
      {icon ? (
        <div className="relative mb-5 flex size-14 items-center justify-center rounded-full bg-primary-light text-primary-dark">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
          <span className="relative">{icon}</span>
        </div>
      ) : null}
      <h3 className="font-heading text-base font-bold text-navy">{title ?? T.empty.insufficient}</h3>
      {description ? <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-soft">{description}</p> : null}
      {actions ? <div className="mt-6 flex items-center justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  useI18n();
  return <div className={cn("animate-pulse rounded-md bg-line/60", className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  useI18n();
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="h-12 bg-subtle/80 border-b border-line" />
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <Skeleton className="h-4 w-20 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-24 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  useI18n();
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      
      <div className="flex gap-4 h-24">
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-[30rem] rounded-xl" />
        <Skeleton className="h-[30rem] rounded-xl" />
      </div>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  useI18n();
  return <Skeleton className={cn("h-32 rounded-xl", className)} />;
}
