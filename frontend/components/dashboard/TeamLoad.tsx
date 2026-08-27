"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";
import { buildWorkloads } from "@/lib/workload";

export function TeamLoad({
  items,
  href,
}: {
  items: RecommendationListItem[];
  href: string;
}) {
  const { locale } = useI18n();
  const workloads = buildWorkloads(items, T.team.unassigned);

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Section
      title={T.dashboard.teamLoad}
      hint={T.dashboard.teamLoadHint}
      className="bg-surface h-full"
      actions={
        <Link href={href} className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-4 py-1.5 text-[13px] font-bold text-primary-dark ring-1 ring-line hover:bg-surface hover:text-primary transition-all">
          {T.nav.teamProgress}
          <DirForward className="size-4" />
        </Link>
      }
    >
      {workloads.length ? (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[36rem] text-[13px]">
            <thead className="bg-subtle/80">
              <tr className="border-b border-line text-start text-[11.5px] font-bold uppercase tracking-wider text-ink-soft">
                <th className="px-5 py-3.5 text-start">{T.common.responsible}</th>
                <th className="px-3 py-3.5 text-start">{T.team.load}</th>
                <th className="px-3 py-3.5 text-start">{T.team.overdueLoad}</th>
                <th className="px-5 py-3.5 text-start">{T.team.nearest}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workloads.map((row) => (
                <tr key={row.name} className="group transition-colors hover:bg-subtle/60">
                  <td className="px-5 py-4 font-bold text-ink">{row.name}</td>
                  <td className="px-3 py-4 font-mono font-medium tabular-nums text-ink-soft" dir="ltr">
                    {row.items.length}
                  </td>
                  <td className="px-3 py-4" dir="ltr">
                    <span className={row.overdue ? "inline-flex min-w-8 justify-center rounded-full bg-danger-light/50 px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums text-danger-dark ring-1 ring-danger/20" : "font-mono font-medium text-muted"}>
                      {row.overdue}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-medium text-ink-soft" dir="ltr">
                    {formatDate(row.nearest)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={<Users className="size-6" />} title={T.team.empty} description={T.team.emptyHint} className="border-0 shadow-none py-10" />
      )}
    </Section>
  );
}
