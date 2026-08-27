import { RISK_LABELS, T, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";

const RISK_STYLE: Record<string, { fg: string; bg: string; border: string; icon: typeof AlertTriangle }> = {
  high: {
    fg: "text-danger-dark",
    bg: "bg-danger-light",
    border: "border-danger/30",
    icon: ShieldAlert,
  },
  medium: {
    fg: "text-warning-dark",
    bg: "bg-warning-light",
    border: "border-warning/30",
    icon: AlertTriangle,
  },
  low: {
    fg: "text-success-dark",
    bg: "bg-success-light",
    border: "border-success/30",
    icon: ShieldCheck,
  },
};

export function RiskBadge({ level }: { level: string }) {
  useI18n();
  const style = RISK_STYLE[level] ?? RISK_STYLE.medium;
  const label = RISK_LABELS[level] ?? level;
  const Icon = style.icon;
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold tracking-wide shadow-sm",
        style.fg,
        style.bg,
        style.border
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
      {level === "high" ? T.common.highRisk : label}
    </span>
  );
}
