import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export function EmptyState({
  title,
  description,
  icon,
  className,
  compact = false,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  useI18n();
  return (
    <div
      className={cn(
        "rounded-(--radius-card) border border-line bg-surface text-center",
        compact ? "px-4 py-4" : "px-5 py-6",
        className
      )}
    >
      {icon ? (
        <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-primary-light text-primary-dark">
          {icon}
        </div>
      ) : null}
      <p className="font-heading text-sm font-semibold text-navy">{title ?? T.empty.insufficient}</p>
      {description ? <p className="mt-1 text-[13px] text-ink-soft">{description}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  useI18n();
  return <div className={cn("animate-pulse rounded-md bg-line/80", className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  useI18n();
  return (
    <div className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
      <div className="h-11 bg-inverse" />
      <div className="divide-y divide-line p-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  useI18n();
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-28 rounded-(--radius-card)" />
      <Skeleton className="h-20 rounded-(--radius-card)" />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_19.5rem]">
        <Skeleton className="h-48 rounded-(--radius-card)" />
        <Skeleton className="h-48 rounded-(--radius-card)" />
      </div>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  useI18n();
  return <Skeleton className={cn("h-24 rounded-(--radius-card)", className)} />;
}
