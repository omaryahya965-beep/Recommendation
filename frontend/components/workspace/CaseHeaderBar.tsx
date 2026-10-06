"use client";

import { ChevronLeft, ChevronRight, Repeat2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { clipTitle } from "@/lib/finding";
import { recordCode } from "@/lib/format";
import { ENGAGEMENT_LABELS, RESOLUTION_LABELS, T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";

/** What this case is: reference, title, department, status and risk. */
export function CaseHeaderBar({
  rec,
  backHref,
  backLabel,
  actions,
}: {
  rec: RecommendationDetail;
  backHref: string;
  backLabel: string;
  /** Page-level tools (print), shown beside the back link. */
  actions?: ReactNode;
}) {
  const { locale } = useI18n();
  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <header>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          data-print="hide"
          className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-primary-dark hover:underline"
        >
          <DirBack className="size-4" aria-hidden />
          {backLabel}
        </Link>
        {actions ? (
          <div className="flex items-center gap-2" data-print="hide">
            {actions}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
            <span className="font-mono text-[13px] font-bold text-muted" dir="ltr">
              {recordCode(rec.id)}
            </span>
            <span aria-hidden className="text-line">
              •
            </span>
            <span className="font-semibold">{rec.department_name}</span>
            <span aria-hidden className="text-line">
              •
            </span>
            <span>{ENGAGEMENT_LABELS[rec.engagement_type] ?? rec.engagement_type}</span>
          </p>
          <h1 className="mt-1.5 font-heading text-[1.375rem] font-bold leading-snug text-navy md:text-[1.6rem]">
            <bdi>{clipTitle(rec.title, 160)}</bdi>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={rec.status} size="lg" />
          <RiskBadge level={rec.risk_level} />
          {rec.is_recurring ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-light/60 px-2.5 py-1 text-[12px] font-bold text-warning-dark ring-1 ring-warning/30">
              <Repeat2 className="size-3.5" aria-hidden />
              {rec.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
            </span>
          ) : null}
        </div>
      </div>

      {rec.resolution ? (
        <p className="mt-3 inline-flex rounded-md bg-success-light px-3 py-1 text-[13px] font-bold text-success-dark ring-1 ring-success/20">
          {T.case.resolution}: {RESOLUTION_LABELS[rec.resolution] ?? rec.resolution}
        </p>
      ) : null}
    </header>
  );
}
