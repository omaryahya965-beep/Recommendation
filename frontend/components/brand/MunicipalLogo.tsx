"use client";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

/**
 * Original emblem for the municipal Internal Control platform.
 * Not a reproduction of any municipality's official logo.
 */
export function MunicipalLogo({
  className,
  size = "md",
  inverted = false,
  withWordmark = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
  withWordmark?: boolean;
}) {
  useI18n();
  const px = size === "lg" ? 64 : size === "sm" ? 36 : 48;
  const titleClass =
    size === "lg"
      ? "text-xl font-bold"
      : size === "sm"
        ? "text-sm font-semibold"
        : "text-base font-bold";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="64" height="64" rx="14" fill={inverted ? "#F6F8F7" : "#183B4E"} />
        <rect x="4" y="4" width="56" height="56" rx="11" stroke={inverted ? "#176B63" : "#176B63"} strokeWidth="1.5" />
        <path
          d="M32 14c.4 6.5 1.2 12 8.5 16.5C33.2 32 32.4 38.5 32 50c-.4-11.5-1.2-18-8.5-19.5C30.8 26 31.6 20.5 32 14Z"
          fill={inverted ? "#176B63" : "#E7F3F0"}
        />
        <path
          d="M32 18c.3 5 1 9.2 6.6 12.8C33 32.2 32.3 37.4 32 46.5c-.3-9.1-1-14.3-6.6-15.7C31 27.2 31.7 23 32 18Z"
          fill={inverted ? "#0F4F49" : "#176B63"}
        />
        <path
          d="M22.5 28.5c4.2-1.2 7.3-4.2 8.6-8.2"
          stroke="#718355"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M41.5 28.5c-4.2-1.2-7.3-4.2-8.6-8.2"
          stroke="#718355"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M24.5 42.5 30 48l10-12"
          stroke="#C9A24A"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark ? (
        <div className="min-w-0 text-start">
          <p className={cn("font-heading leading-snug", titleClass, inverted ? "text-navy" : "text-white")}>
            {T.login.logoTitle}
          </p>
          <p className={cn("text-[11px] leading-relaxed", inverted ? "text-ink-soft" : "text-white/70")}>
            {T.login.logoTagline}
          </p>
        </div>
      ) : null}
    </div>
  );
}
