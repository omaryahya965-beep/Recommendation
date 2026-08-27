"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Pins an already-available primary action above the home indicator on phones.
 * Hidden from md and up so desktop layout is unchanged.
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className="h-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:hidden" aria-hidden />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 shadow-[0_-8px_24px_rgb(20_32_30/0.08)] backdrop-blur-md md:hidden",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-2">{children}</div>
      </div>
    </>
  );
}
