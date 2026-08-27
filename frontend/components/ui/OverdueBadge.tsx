import { T, useI18n } from "@/lib/i18n";
import { ageingBucketLabel, daysUntil } from "@/lib/format";
import { cn } from "@/lib/cn";
import { AlertCircle } from "lucide-react";

export function OverdueBadge({
  targetDate,
  overdue,
}: {
  targetDate?: string | null;
  overdue?: boolean;
}) {
  useI18n();
  const days = daysUntil(targetDate);
  if (overdue && days !== null && days < 0) {
    const late = Math.abs(days);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger bg-danger-light px-2.5 py-0.5 text-[12px] font-bold text-danger-dark shadow-[0_0_8px_rgba(201,75,75,0.2)] animate-pulse">
        <AlertCircle className="size-3.5" strokeWidth={2.5} aria-hidden />
        {T.common.overdueBadge} {late} {late === 1 ? T.common.day : T.common.daysAccusative}
        <span className="text-[10px] font-medium opacity-80 ms-0.5">({ageingBucketLabel(late)})</span>
      </span>
    );
  }
  if (days === null) return <span className="text-muted/60">—</span>;
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-danger-dark bg-danger-light/50 px-2 rounded-full">
        {T.common.overdueBadge} {Math.abs(days)}
      </span>
    );
  }
  if (days === 0) {
    return <span className="inline-flex items-center font-bold text-warning-dark bg-warning-light/60 px-2 rounded-full">{T.common.today}</span>;
  }
  const tone = days <= 7 ? "text-warning-dark font-bold bg-warning-light/30 px-1.5 rounded" : "text-ink-soft";
  return (
    <span className={cn("font-mono text-[12.5px]", tone)} dir="ltr">
      {days}
    </span>
  );
}

export function DaysRemaining({ targetDate, overdue }: { targetDate?: string | null; overdue?: boolean }) {
  useI18n();
  return <OverdueBadge targetDate={targetDate} overdue={overdue} />;
}
