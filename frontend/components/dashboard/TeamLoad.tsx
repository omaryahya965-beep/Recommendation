"use client";

import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";
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
  useI18n();
  const workloads = buildWorkloads(items, T.team.unassigned);

  return (
    <Section
      title={T.dashboard.teamLoad}
      hint={T.dashboard.teamLoadHint}
      actions={
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary-dark hover:underline">
          {T.nav.teamProgress}
          <DirForward className="size-3.5" />
        </Link>
      }
    >
      {workloads.length ? (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[32rem] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-subtle text-start text-xs font-semibold text-ink-soft">
                <th className="px-4 py-2.5 text-start font-semibold">{T.common.responsible}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{T.team.load}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{T.team.overdueLoad}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{T.team.nearest}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workloads.map((row) => (
                <tr key={row.name} className="transition-colors hover:bg-subtle/80">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-3 py-3 font-mono tabular-nums" dir="ltr">
                    {row.items.length}
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums" dir="ltr">
                    <span className={row.overdue ? "font-semibold text-danger-dark" : "text-muted"}>{row.overdue}</span>
                  </td>
                  <td className="px-3 py-3 font-mono text-ink-soft" dir="ltr">
                    {formatDate(row.nearest)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact title={T.team.empty} description={T.team.emptyHint} className="border-0 shadow-none" />
      )}
    </Section>
  );
}
