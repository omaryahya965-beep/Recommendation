"use client";

import { AlBirehSeal } from "@/components/brand/AlBirehSeal";
import { cn } from "@/lib/cn";

export function MunicipalityMark({
  inverted = false,
  size = "md",
  layout = "horizontal",
  showTagline = true,
  className,
}: {
  inverted?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  layout?: "horizontal" | "stacked";
  showTagline?: boolean;
  className?: string;
}) {
  const isStacked = layout === "stacked";

  const titleClass =
    size === "xl" || size === "lg"
      ? "text-[18px] sm:text-[20px] font-extrabold leading-tight tracking-tight"
      : size === "sm"
        ? "text-[14px] font-bold leading-tight"
        : "text-[16px] font-bold leading-tight";

  const subClass =
    size === "xl" || size === "lg"
      ? "text-[11px] sm:text-[12px] font-semibold tracking-wider uppercase leading-tight mt-0.5"
      : size === "sm"
        ? "text-[9.5px] font-semibold tracking-wider uppercase leading-tight mt-0.5"
        : "text-[10.5px] font-semibold tracking-wider uppercase leading-tight mt-0.5";

  return (
    <div
      className={cn(
        isStacked
          ? "flex flex-col items-center text-center"
          : "flex items-center gap-3 text-start",
        className
      )}
    >
      <AlBirehSeal size={size} />
      <div className={cn(isStacked ? "mt-2.5 text-center" : "text-start")}>
        <p
          className={cn(
            titleClass,
            inverted ? "text-white" : "text-[var(--login-navy,#102F40)]"
          )}
        >
          بلدية البيرة
        </p>
        {showTagline ? (
          <p
            dir="ltr"
            className={cn(
              subClass,
              inverted ? "text-white/80" : "text-[var(--login-muted,#647784)]"
            )}
          >
            AL-BIREH MUNICIPALITY
          </p>
        ) : null}
      </div>
    </div>
  );
}
