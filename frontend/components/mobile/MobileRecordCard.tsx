"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ExpandableSection } from "@/components/mobile/ExpandableSection";
import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";

const RISK_BORDER: Record<string, string> = {
  high: "border-s-danger",
  medium: "border-s-warning",
  low: "border-s-success",
};

export function MobileRecordCard({
  href,
  id,
  idPrefix = "REC",
  title,
  status,
  risk,
  owner,
  department,
  dueDate,
  dueLabel,
  dueBadge,
  overdue,
  actionLabel,
  extra,
  className,
}: {
  href: string;
  id: number;
  idPrefix?: string;
  title: string;
  status?: string;
  risk?: string;
  owner?: string | null;
  department?: string | null;
  dueDate?: string | null;
  /** What the date is (defaults to the target date). */
  dueLabel?: string;
  /** How late or how soon, from the server's workflow facts (e.g. CaseDue). */
  dueBadge?: ReactNode;
  overdue?: boolean;
  actionLabel?: string;
  extra?: ReactNode;
  className?: string;
}) {
  useI18n();
  const border = (risk && RISK_BORDER[risk]) || "border-s-primary";

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border border-line border-s-4 bg-surface p-4 shadow-sm",
        border,
        overdue && "border-danger/30",
        className,
      )}
    >
      <Link href={href} className="block min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <RecordId id={id} prefix={idPrefix} />
          {status ? <StatusBadge status={status} /> : null}
          {risk ? <RiskBadge level={risk} /> : null}
        </div>
        <h3 className="mt-3 line-clamp-3 font-heading text-[16px] font-semibold leading-snug text-navy [overflow-wrap:anywhere]" title={title}><bdi>{title}</bdi></h3>
        <dl className="mt-3 grid gap-2 text-[14px]">
          {department ? (
            <div className="min-w-0">
              <dt className="text-[13px] font-semibold text-muted">{T.common.department}</dt>
              <dd className="truncate font-medium text-ink">{department}</dd>
            </div>
          ) : null}
          {owner ? (
            <div className="min-w-0">
              <dt className="text-[13px] font-semibold text-muted">{T.common.responsible}</dt>
              <dd className="truncate font-medium text-ink">{owner}</dd>
            </div>
          ) : null}
          {dueDate !== undefined ? (
            <div className="min-w-0">
              <dt className="text-[13px] font-semibold text-muted">{dueLabel ?? T.common.targetDate}</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium text-ink">
                <span className="font-mono text-muted" dir="ltr">
                  {formatDate(dueDate)}
                </span>
                {dueBadge}
              </dd>
            </div>
          ) : null}
        </dl>
        {actionLabel ? (
          <p className="mt-3 text-[14px] font-bold text-primary-dark">{actionLabel}</p>
        ) : null}
      </Link>
      {extra ? (
        <ExpandableSection className="mt-2 border-t border-line pt-1">{extra}</ExpandableSection>
      ) : null}
    </article>
  );
}
