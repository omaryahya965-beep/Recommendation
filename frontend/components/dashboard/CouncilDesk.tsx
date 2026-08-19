"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { REPORT_STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport } from "@/lib/types";
import { REPORT_STAGES } from "@/components/reports/ReportPipeline";

export function ReportStageBoard({ reports }: { reports: AuditReport[] }) {
  useI18n();
  const counts = REPORT_STAGES.map((stage) => ({
    ...stage,
    count: reports.filter((report) => report.status === stage.id).length,
  }));
  const total = reports.length;

  return (
    <Section title={T.dashboard.reportsPipeline} hint={T.dashboard.reportsPipelineHint}>
      {total ? (
        <ol className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          {counts.map((stage, index) => {
            const active = stage.count > 0;
            return (
              <li key={stage.id} className="flex min-h-[6.5rem] flex-col justify-center bg-surface px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full font-mono text-[10px]",
                      active ? "bg-primary text-white" : "bg-subtle text-ink-soft"
                    )}
                  >
                    {active && stage.id === "ratified" ? <Check className="size-2.5" strokeWidth={3} /> : index + 1}
                  </span>
                  {REPORT_STATUS_LABELS[stage.id]}
                </p>
                <p className="mt-2 font-heading text-[1.35rem] font-bold tabular-nums leading-none text-navy" dir="ltr">
                  {stage.count}
                </p>
                <p className="mt-1 text-xs text-muted">{T.workflow.reportActors[stage.actorKey]}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact title={T.reports.empty} className="border-0 shadow-none" />
      )}
    </Section>
  );
}

export function DecisionTable({
  reports,
  closures,
}: {
  reports: AuditReport[];
  closures: Array<{
    id: number;
    title: string;
    department: string;
    risk?: string;
    stage: string;
    submitted?: string | null;
    href: string;
    decision: string;
    status: string;
  }>;
}) {
  useI18n();
  const reportRows = reports.map((report) => ({
    id: `RPT-${report.id}`,
    title: report.title,
    department: report.department_name,
    risk: "—",
    stage: REPORT_STATUS_LABELS[report.status],
    submitted: report.created_at,
    href: "/council/pending-approvals",
    decision: T.dashboard.ratifyDecision,
    status: REPORT_STATUS_LABELS[report.status],
  }));

  const rows = [...reportRows, ...closures];

  return (
    <Section title={T.dashboard.pendingDecisions}>
      {rows.length ? (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[44rem] text-[13px]">
            <thead>
              <tr className="bg-subtle/80 text-start text-[11.5px] font-medium text-ink-soft">
                <th className="px-4 py-2 text-start font-medium">{T.common.details}</th>
                <th className="px-3 py-2 text-start font-medium">{T.common.department}</th>
                <th className="px-3 py-2 text-start font-medium">{T.common.risk}</th>
                <th className="px-3 py-2 text-start font-medium">{T.case.currentStage}</th>
                <th className="px-3 py-2 text-start font-medium">{T.dashboard.requiredDecision}</th>
                <th className="px-3 py-2 text-start font-medium">{T.common.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-subtle/60">
                  <td className="px-4 py-2.5">
                    <Link href={row.href} className="font-medium text-ink hover:text-primary-dark">
                      {row.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-muted" dir="ltr">
                      {row.id}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">{row.department}</td>
                  <td className="px-3 py-2.5">{row.risk}</td>
                  <td className="px-3 py-2.5">{row.stage}</td>
                  <td className="px-3 py-2.5 font-medium text-primary-dark">{row.decision}</td>
                  <td className="px-3 py-2.5">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact title={T.dashboard.nothingPending} className="border-0 shadow-none" />
      )}
    </Section>
  );
}
