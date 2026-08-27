"use client";

import { Check, ClipboardList } from "lucide-react";
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
    <Section title={T.dashboard.reportsPipeline} hint={T.dashboard.reportsPipelineHint} className="bg-surface overflow-hidden">
      {total ? (
        <ol className="grid grid-cols-2 sm:grid-cols-5 -mb-px -me-px">
          {counts.map((stage, index) => {
            const active = stage.count > 0;
            return (
              <li key={stage.id} className="group flex min-h-[7rem] flex-col justify-center border-b border-e border-line px-5 py-4 transition-colors hover:bg-subtle/50 relative hover:z-10 hover:shadow-inner">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted mb-2">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full font-mono text-[10px] ring-1",
                      active ? "bg-primary text-white ring-primary" : "bg-surface text-ink-soft ring-line"
                    )}
                  >
                    {active && stage.id === "ratified" ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                  </span>
                  {REPORT_STATUS_LABELS[stage.id]}
                </p>
                <p className={cn("font-heading text-[1.75rem] font-bold tabular-nums leading-none tracking-tight", active ? "text-navy" : "text-muted")} dir="ltr">
                  {stage.count}
                </p>
                <p className="mt-2 text-[11px] font-medium text-ink-soft">{T.workflow.reportActors[stage.actorKey]}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact icon={<ClipboardList className="size-6" />} title={T.reports.empty} className="border-0 shadow-none py-10" />
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
    <Section title={T.dashboard.pendingDecisions} className="bg-surface h-full">
      {rows.length ? (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[50rem] text-[13px]">
            <thead className="bg-subtle/80">
              <tr className="border-b border-line text-start text-[11.5px] font-bold uppercase tracking-wider text-ink-soft">
                <th className="px-5 py-3.5 text-start">{T.common.details}</th>
                <th className="px-3 py-3.5 text-start">{T.common.department}</th>
                <th className="px-3 py-3.5 text-start">{T.common.risk}</th>
                <th className="px-3 py-3.5 text-start">{T.case.currentStage}</th>
                <th className="px-3 py-3.5 text-start">{T.dashboard.requiredDecision}</th>
                <th className="px-5 py-3.5 text-start">{T.common.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="group transition-colors hover:bg-subtle/60">
                  <td className="px-5 py-4">
                    <Link href={row.href} className="font-bold text-ink hover:text-primary-dark transition-colors">
                      {row.title}
                    </Link>
                    <p className="mt-1 font-mono text-[11px] font-medium text-muted" dir="ltr">
                      {row.id}
                    </p>
                  </td>
                  <td className="px-3 py-4 font-medium text-ink-soft">{row.department}</td>
                  <td className="px-3 py-4 text-ink-soft">{row.risk}</td>
                  <td className="px-3 py-4 font-medium text-ink-soft">{row.stage}</td>
                  <td className="px-3 py-4 font-bold text-primary-dark">{row.decision}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-md bg-subtle px-2 py-0.5 text-[11.5px] font-bold text-ink-soft border border-line">
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact title={T.dashboard.nothingPending} className="border-0 shadow-none py-10" />
      )}
    </Section>
  );
}
