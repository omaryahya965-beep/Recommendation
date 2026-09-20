"use client";

import { MunicipalityLogo } from "@/components/brand/MunicipalityLogo";
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
      <MunicipalityLogo size={size} />
      <div className={cn(isStacked ? "mt-2.5 text-center" : "text-start")}>
        <p
          className={cn(
            titleClass,
            inverted ? "text-[var(--login-hero-text,#ffffff)]" : "text-[var(--login-navy,#102F40)]"
          )}
        >
          بلدية البيرة
        </p>
        {showTagline ? (
          <p
            dir="ltr"
            className={cn(
              subClass,
              inverted ? "text-[var(--login-hero-text-sub,rgba(255,255,255,0.8))]" : "text-[var(--login-muted,#647784)]"
            )}
          >
            AL-BIREH MUNICIPALITY
          </p>
        ) : null}
      </div>
    </div>
  );
}
