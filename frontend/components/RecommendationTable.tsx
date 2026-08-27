"use client";

import Link from "next/link";

import { MobileRecordCard } from "@/components/mobile/MobileRecordCard";
import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";
import { STATUS_NEXT_ACTION } from "@/lib/workflow";

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
    <>
      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <MobileRecordCard
              href={detailHref(item)}
              id={item.id}
              title={caseTitle(item.text, 120)}
              status={item.status}
              risk={item.risk_level}
              owner={item.responsible_employee}
              department={showDepartment ? item.department_name : null}
              dueDate={item.target_date}
              overdue={item.overdue}
              actionLabel={STATUS_NEXT_ACTION[item.status]?.action ?? T.table.view}
              extra={
                item.is_recurring ? (
                  <p className="text-[13px] text-ink-soft">{T.common.recurringBadge}</p>
                ) : null
              }
            />
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
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
                <Link href={detailHref(item)} className="text-[12px] font-medium text-primary-dark hover:underline">
                  {T.table.view}
                </Link>
              </LedgerCell>
            </tr>
          ))}
        </LedgerTable>
      </div>
    </>
  );
}
