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
}: {
  status: string;
  size?: "sm" | "lg";
  label?: string;
}) {
  useI18n();
  const tone: StatusTone = (STATUS_TONE as Record<string, StatusTone>)[status] ?? "neutral";
  const classes = TONE_CLASSES[tone];
  const text = label ?? STATUS_LABELS[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap",
        size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[12px]",
        classes.fg,
        classes.bg,
        classes.border
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", classes.dot)} aria-hidden />
      {text}
    </span>
  );
}

/** @deprecated visual stamp retired — alias kept so existing imports keep working. */
export function StampBadge(props: ComponentProps<typeof StatusBadge>) {
  useI18n();
  return <StatusBadge {...props} />;
}
