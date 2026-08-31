"use client";

import { MunicipalLogo } from "@/components/brand/MunicipalLogo";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export function MunicipalityMark({
  inverted = false,
  size = "md",
  layout = "horizontal",
  showTagline = true,
  className,
}: {
  inverted?: boolean;
  size?: "sm" | "md" | "lg";
  layout?: "horizontal" | "stacked";
  showTagline?: boolean;
  className?: string;
}) {
  useI18n();
  const titleClass =
    size === "lg"
      ? "text-[1.05rem] font-semibold leading-tight"
      : size === "sm"
        ? "text-[14px] font-semibold leading-tight"
        : "text-[15px] font-semibold leading-tight";
  const tagClass =
    size === "sm" ? "text-[11px] leading-snug" : "text-[12px] leading-snug";

  return (
    <div
      className={cn(
        layout === "stacked"
          ? "flex flex-col items-center"
          : "flex items-center gap-3",
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0",
          layout === "stacked" && "mb-2.5",
          !inverted && "rounded-[1.35rem] bg-[#183B4E] p-1 shadow-md ring-1 ring-black/10"
        )}
      >
        <MunicipalLogo className="w-fit shrink-0" size={size === "sm" ? "md" : "lg"} inverted />
      </div>
      <div className={cn(layout === "horizontal" ? "text-start" : "text-center")}>
        <p className={cn(titleClass, inverted ? "text-white" : "text-[var(--login-text,#102F40)]")}>
          {T.login.municipalityName}
        </p>
        {showTagline ? (
          <p className={cn(tagClass, "mt-0.5", inverted ? "text-white/85" : "text-[var(--login-muted,#647784)]")}>
            {T.login.municipalityTagline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
