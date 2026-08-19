"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { DirForward } from "@/components/i18n/DirIcon";
import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StampBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";
import { stageForStatus, STATUS_NEXT_ACTION } from "@/lib/workflow";

export type WorkColumn =
  | "id"
  | "title"
  | "department"
  | "owner"
  | "risk"
  | "status"
  | "stage"
  | "deadline"
  | "action";

const ALL: WorkColumn[] = ["id", "title", "department", "owner", "risk", "status", "deadline", "action"];

function headerFor(col: WorkColumn): string {
  switch (col) {
    case "id":
      return T.table.number;
    case "title":
      return T.table.recommendation;
    case "department":
      return T.common.department;
    case "owner":
      return T.common.responsible;
    case "risk":
      return T.common.risk;
    case "status":
      return T.common.status;
    case "stage":
      return T.case.currentStage;
    case "deadline":
      return T.common.targetDate;
    case "action":
      return T.workflow.requiredAction;
  }
}

/**
 * Work table. List payloads have no plan progress %, so that column is omitted.
 * `stage` is the workflow stage derived from status — not a new backend field.
 */
export function PressureTable({
  items,
  detailHref,
  title,
  hint,
  columns = ALL,
}: {
  items: RecommendationListItem[];
  detailHref: (item: RecommendationListItem) => string;
  title?: string;
  hint?: string;
  columns?: WorkColumn[];
}) {
  useI18n();
  const router = useRouter();
  const show = (col: WorkColumn) => columns.includes(col);

  return (
    <Section title={title ?? T.dashboard.hottest} hint={hint ?? T.dashboard.hottestHint}>
      {items.length ? (
        <LedgerTable framed={false} headers={columns.map(headerFor)}>
          {items.map((item) => {
            const next = STATUS_NEXT_ACTION[item.status];
            const href = detailHref(item);
            const stage = stageForStatus(item.status);
            return (
              <tr
                key={item.id}
                className="cursor-pointer hover:bg-primary-light/40"
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("a")) return;
                  router.push(href);
                }}
              >
                {show("id") ? (
                  <LedgerCell mono>
                    <RecordId id={item.id} />
                  </LedgerCell>
                ) : null}
                {show("title") ? (
                  <LedgerCell className="max-w-sm">
                    <Link href={href} className="line-clamp-2 font-medium hover:text-primary-dark hover:underline">
                      {caseTitle(item.text, 90)}
                    </Link>
                  </LedgerCell>
                ) : null}
                {show("department") ? <LedgerCell>{item.department_name}</LedgerCell> : null}
                {show("owner") ? <LedgerCell>{item.responsible_employee ?? "—"}</LedgerCell> : null}
                {show("risk") ? (
                  <LedgerCell>
                    <RiskBadge level={item.risk_level} />
                  </LedgerCell>
                ) : null}
                {show("status") ? (
                  <LedgerCell>
                    <StatusBadge status={item.status} />
                  </LedgerCell>
                ) : null}
                {show("stage") ? <LedgerCell>{stage.label}</LedgerCell> : null}
                {show("deadline") ? (
                  <LedgerCell>
                    <span className="block font-mono text-xs" dir="ltr">
                      {formatDate(item.target_date)}
                    </span>
                    <div className="mt-1">
                      <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                    </div>
                  </LedgerCell>
                ) : null}
                {show("action") ? (
                  <LedgerCell className="max-w-[13rem]">
                    <Link
                      href={href}
                      className="inline-flex items-center gap-1 text-[12.5px] font-medium leading-snug text-primary-dark hover:underline"
                    >
                      {next.action}
                      <DirForward className="size-3" />
                    </Link>
                  </LedgerCell>
                ) : null}
              </tr>
            );
          })}
        </LedgerTable>
      ) : (
        <EmptyState compact title={T.common.noResults} className="border-0 shadow-none" />
      )}
    </Section>
  );
}
