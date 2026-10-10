"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/EmptyState";
import { recordCode } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Placeholder in the exact shape of a case (or report) page, shown until its
 * data arrives. The back link and the record code come from the route, which
 * the viewer already holds; everything private stays a placeholder, and a
 * record the viewer may not open still ends in the page's error state.
 */
export function CaseSkeleton({
  id,
  prefix = "REC",
  backHref,
  backLabel,
  backClassName = "font-bold text-primary-dark",
}: {
  id: number;
  prefix?: string;
  backHref: string;
  backLabel: string;
  /** Match the loaded page's back link so nothing restyles on arrival. */
  backClassName?: string;
}) {
  const { locale } = useI18n();
  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <div className="space-y-6" aria-busy="true">
      <header className="border-b border-line pb-6">
        <Link
          href={backHref}
          className={`inline-flex min-h-11 items-center gap-1.5 text-[14px] ${backClassName}`}
        >
          <DirBack className="size-4" />
          {backLabel}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-bold text-muted" dir="ltr">
              {recordCode(id, prefix)}
            </p>
            <Skeleton className="mt-2.5 h-7 w-4/5 max-w-xl" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </header>
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
