"use client";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

function Emblem({
  inverted,
  className,
}: {
  inverted?: boolean;
  className?: string;
}) {
  const gold = inverted ? "none" : "#E8B84A";
  const tree = inverted ? "#FFFFFF" : "#2F7A3A";
  const year = inverted ? "#FFFFFF" : "#C43B2C";
  const ring = inverted ? "#FFFFFF" : "#C4922A";

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill={gold} stroke={ring} strokeWidth="1.5" />
      <path
        d="M32 14c.4 7.2 1.6 12.4 8.8 16.2C33.4 32.2 32.6 38 32 50c-.6-12-1.4-17.8-8.8-19.8C30.4 26.4 31.6 21.2 32 14Z"
        fill={tree}
      />
      <path
        d="M22 28c4.6-1.4 8.2-4.8 9.6-9.4"
        stroke={tree}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M42 28c-4.6-1.4-8.2-4.8-9.6-9.4"
        stroke={tree}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20.5 33.5c5.2-1 9.2-3.8 11.2-7.8"
        stroke={tree}
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M43.5 33.5c-5.2-1-9.2-3.8-11.2-7.8"
        stroke={tree}
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.85"
      />
      <text
        x="32"
        y="58"
        textAnchor="middle"
        fill={year}
        fontSize="7.5"
        fontWeight="700"
        fontFamily="IBM Plex Sans Arabic, sans-serif"
      >
        1908
      </text>
    </svg>
  );
}

export function RamallahMark({
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
  const emblemClass =
    size === "lg" ? "size-[4.5rem]" : size === "sm" ? "size-12" : "size-14";
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
          ? "flex flex-col items-center text-center"
          : "flex items-center gap-2.5",
        className
      )}
      dir={layout === "horizontal" ? "ltr" : undefined}
    >
      <Emblem inverted={inverted} className={cn("shrink-0", emblemClass, layout === "stacked" && "mb-2")} />
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
