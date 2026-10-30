import type { ComponentProps } from "react";
import { STATUS_LABELS, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { STATUS_TONE, TONE_CLASSES, type StatusTone } from "@/lib/workflow";

/**
 * Status is always color + text (never color alone).
 */
export function StatusBadge({
  status,
  size = "sm",
  label,
  wrap = false,
}: {
  status: string;
  size?: "sm" | "lg";
  label?: string;
  /** In a narrow table column: wrap to two lines instead of overflowing. */
  wrap?: boolean;
}) {
  useI18n();
  const tone: StatusTone = (STATUS_TONE as Record<string, StatusTone>)[status] ?? "neutral";
  const classes = TONE_CLASSES[tone];
  const text = label ?? STATUS_LABELS[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold shadow-sm transition-colors",
        wrap ? "max-w-full whitespace-normal text-start leading-tight" : "whitespace-nowrap",
        size === "lg" ? "px-3.5 py-1.5 text-[13px]" : "px-2.5 py-0.5 text-[11px]",
        classes.fg,
        classes.bg,
        classes.border
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", classes.dot)} aria-hidden />
      {/* In a table cell: at most two lines, the full label on hover. */}
      {wrap ? <span className="line-clamp-2 min-w-0" title={text}>{text}</span> : text}
    </span>
  );
}

/** @deprecated visual stamp retired — alias kept so existing imports keep working. */
export function StampBadge(props: ComponentProps<typeof StatusBadge>) {
  useI18n();
  return <StatusBadge {...props} />;
}
