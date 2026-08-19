import { RISK_LABELS, T, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const RISK_STYLE: Record<string, { fg: string; bg: string; border: string; dot: string }> = {
  high: {
    fg: "text-danger-dark",
    bg: "bg-danger-light",
    border: "border-danger/25",
    dot: "bg-danger-dark",
  },
  medium: {
    fg: "text-warning-dark",
    bg: "bg-warning-light",
    border: "border-warning/30",
    dot: "bg-warning",
  },
  low: {
    fg: "text-success-dark",
    bg: "bg-success-light",
    border: "border-success/25",
    dot: "bg-success",
  },
};

export function RiskBadge({ level }: { level: string }) {
  useI18n();
  const style = RISK_STYLE[level] ?? RISK_STYLE.medium;
  const label = RISK_LABELS[level] ?? level;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium",
        style.fg,
        style.bg,
        style.border
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {level === "high" ? T.common.highRisk : label}
    </span>
  );
}
