"use client";

import Link from "next/link";

import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";

export function RecommendationTable({
  items,
  detailHref,
  showDepartment = true,
}: {
  items: RecommendationListItem[];
  detailHref: (item: RecommendationListItem) => string;
  showDepartment?: boolean;
}) {
  useI18n();
  const headers = [
    T.table.number,
    T.table.recommendation,
    ...(showDepartment ? [T.common.department] : []),
    T.common.risk,
    T.common.status,
    T.common.responsible,
    T.common.targetDate,
    T.table.daysLeft,
    T.table.action,
  ];
  return (
    <LedgerTable headers={headers} empty={T.common.noResults}>
      {items.map((item) => (
        <tr key={item.id} className="hover:bg-primary-light/60">
          <LedgerCell mono>
            <RecordId id={item.id} />
          </LedgerCell>
          <LedgerCell className="max-w-md">
            <Link href={detailHref(item)} className="block hover:text-primary-dark hover:underline">
              <span className="line-clamp-2">{caseTitle(item.text, 120)}</span>
            </Link>
            {item.is_recurring && !item.recurrence_confirmed ? (
              <span className="mt-1 inline-flex rounded-md bg-ai-light px-1.5 py-0.5 text-[10px] font-medium text-ai-dark">
                {T.common.recurringBadge}
              </span>
            ) : null}
          </LedgerCell>
          {showDepartment ? <LedgerCell>{item.department_name}</LedgerCell> : null}
          <LedgerCell>
            <RiskBadge level={item.risk_level} />
          </LedgerCell>
          <LedgerCell>
            <StatusBadge status={item.status} />
          </LedgerCell>
          <LedgerCell>{item.responsible_employee ?? "—"}</LedgerCell>
          <LedgerCell mono>
            {item.target_date ? <time dir="ltr">{formatDate(item.target_date)}</time> : <span className="text-muted">—</span>}
          </LedgerCell>
          <LedgerCell>
            <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
          </LedgerCell>
          <LedgerCell>
            <Link
              href={detailHref(item)}
              className="text-[12px] font-medium text-primary-dark hover:underline"
            >
              {T.table.view}
            </Link>
          </LedgerCell>
        </tr>
      ))}
    </LedgerTable>
  );
}
