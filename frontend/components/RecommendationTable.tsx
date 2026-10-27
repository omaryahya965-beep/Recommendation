"use client";

import Link from "next/link";

import { CaseDue } from "@/components/home/Queues";
import { MobileRecordCard } from "@/components/mobile/MobileRecordCard";
import { CellText, LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { clipTitle } from "@/lib/finding";
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
    // The server's binding deadline and its owner rule (W1/W2), as in the
    // register: a case waiting on audit or the council is never shown late.
    T.workflow.bindingDeadline,
    T.table.action,
  ];

  return (
    <>
      <ul className="space-y-3 xl:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <MobileRecordCard
              href={detailHref(item)}
              id={item.id}
              title={clipTitle(item.title, 120)}
              status={item.status}
              risk={item.risk_level}
              owner={item.responsible_employee}
              department={showDepartment ? item.department_name : null}
              dueDate={item.deadline ?? null}
              dueLabel={item.deadline_source ? T.workflow.deadlineSource[item.deadline_source] : T.workflow.bindingDeadline}
              dueBadge={<CaseDue item={item} />}
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
      <div className="hidden xl:block">
        <LedgerTable
          headers={headers}
          widths={["7rem", undefined, ...(showDepartment ? ["8rem"] : []), "7.5rem", "11rem", "7rem", "10.5rem", "4.5rem"]}
          minWidth="60rem"
          empty={T.common.noResults}
        >
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-primary-light/60">
              <LedgerCell mono>
                <RecordId id={item.id} />
              </LedgerCell>
              <LedgerCell>
                <Link href={detailHref(item)} className="block min-w-0 hover:text-primary-dark hover:underline">
                  <CellText text={item.title} />
                </Link>
                {item.is_recurring && !item.recurrence_confirmed ? (
                  <span className="mt-1 inline-flex rounded-md bg-ai-light px-1.5 py-0.5 text-[10px] font-medium text-ai-dark">
                    {T.common.recurringBadge}
                  </span>
                ) : null}
              </LedgerCell>
              {showDepartment ? (
                <LedgerCell>
                  <CellText text={item.department_name} lines={2} />
                </LedgerCell>
              ) : null}
              <LedgerCell>
                <RiskBadge level={item.risk_level} />
              </LedgerCell>
              <LedgerCell>
                <StatusBadge status={item.status} wrap />
              </LedgerCell>
              <LedgerCell>
                <CellText text={item.responsible_employee ?? "—"} lines={2} />
              </LedgerCell>
              <LedgerCell mono>
                {item.deadline ? (
                  <span className="flex flex-col items-start gap-1">
                    <time className="whitespace-nowrap" dir="ltr">{formatDate(item.deadline)}</time>
                    <CaseDue item={item} />
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
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
