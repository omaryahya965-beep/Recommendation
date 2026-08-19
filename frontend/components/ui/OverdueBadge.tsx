import { T, useI18n } from "@/lib/i18n";
import { ageingBucketLabel, daysUntil } from "@/lib/format";
import { cn } from "@/lib/cn";

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
      <span className="inline-flex items-center gap-1 rounded-md border border-danger/25 bg-danger-light px-2 py-0.5 text-[12px] font-medium text-danger-dark">
        <span className="size-1.5 rounded-full bg-danger-dark" aria-hidden />
        {T.common.overdueBadge} {late} {late === 1 ? T.common.day : T.common.daysAccusative}
        <span className="text-[10px] font-normal opacity-80">({ageingBucketLabel(late)})</span>
      </span>
    );
  }
  if (days === null) return <span className="text-muted">—</span>;
  if (days < 0) {
    return (
      <span className="font-medium text-danger-dark">
        {T.common.overdueBadge} {Math.abs(days)}
      </span>
    );
  }
  if (days === 0) {
    return <span className="font-medium text-warning-dark">{T.common.today}</span>;
  }
  const tone = days <= 7 ? "text-warning-dark" : "text-ink-soft";
  return (
    <span className={cn("font-mono text-xs", tone)} dir="ltr">
      {days}
    </span>
  );
}

export function DaysRemaining({ targetDate, overdue }: { targetDate?: string | null; overdue?: boolean }) {
  useI18n();
  return <OverdueBadge targetDate={targetDate} overdue={overdue} />;
}
