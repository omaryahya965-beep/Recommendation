"use client";

import { BrainCircuit, CalendarDays, FileText, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AISummaryPanel } from "@/components/ai/AISummaryPanel";
import { ExpandableSection } from "@/components/mobile/ExpandableSection";
import { ProgressBar } from "@/components/ui/Base";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { ENGAGEMENT_LABELS, T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";
import { casePeople, keyDates, sectionFacts, type KeyDates } from "@/lib/viewmodels/caseView";

function RailCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold text-navy">
        <span className="text-muted" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children, emphasis }: { label: string; children: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="min-w-0 text-[12.5px] text-ink-soft">{label}</dt>
      <dd className={cn("shrink-0 text-[12.5px]", emphasis ? "font-bold text-navy" : "font-semibold text-ink")}>{children}</dd>
    </div>
  );
}

const DATE_ORDER: Array<keyof KeyDates> = [
  "created",
  "issued",
  "ratified",
  "planApproved",
  "planTarget",
  "bindingDeadline",
  "closed",
];

function reportHref(role: Role, rec: RecommendationDetail): string | null {
  if (role === "audit") return `/audit/reports/${rec.report}`;
  if (role === "department_head") return `/department/recommendations?report=${rec.report}`;
  if (role === "council") return `/council/recommendations?report=${rec.report}`;
  return null;
}

/** Facts that support the work but are not the work: dates, people, context. */
export function SideRail({ rec, role }: { rec: RecommendationDetail; role: Role }) {
  useI18n();
  const dates = keyDates(rec);
  const people = casePeople(rec);
  const facts = sectionFacts(rec);
  const href = reportHref(role, rec);
  const sameDeadline = dates.bindingDeadline && dates.bindingDeadline === dates.planTarget;

  return (
    <div className="space-y-4">
      <RailCard title={T.caseView.dates.title} icon={<CalendarDays className="size-4" />}>
        <dl className="divide-y divide-line/70">
          {DATE_ORDER.map((key) => {
            const value = dates[key];
            // The plan date is shown once when it is also the binding deadline.
            if (!value || (key === "planTarget" && sameDeadline)) return null;
            return (
              <Row key={key} label={T.caseView.dates[key]} emphasis={key === "bindingDeadline"}>
                <span className="font-mono" dir="ltr">
                  {formatDate(value)}
                </span>
              </Row>
            );
          })}
        </dl>
      </RailCard>

      {people.length ? (
        <RailCard title={T.caseView.people.title} icon={<Users className="size-4" />}>
          <ul className="space-y-2.5">
            {people.map((person) => (
              <li key={person.key} className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{person.name}</p>
                <p className="text-[11.5px] text-muted">{T.caseView.people[person.part]}</p>
              </li>
            ))}
          </ul>
        </RailCard>
      ) : null}

      <RailCard title={T.caseView.context.title} icon={<FileText className="size-4" />}>
        <p className="text-[13px] font-semibold leading-snug text-ink">{rec.report_title}</p>
        {href ? (
          <Link href={href} className="mt-1 inline-flex min-h-9 items-center text-[12.5px] font-bold text-primary-dark hover:underline">
            {role === "audit" ? T.caseView.context.openReport : T.caseView.context.reportCases}
          </Link>
        ) : null}
        <dl className="mt-2 divide-y divide-line/70 border-t border-line/70">
          <Row label={T.common.department}>{rec.department_name}</Row>
          <Row label={T.caseView.context.engagement}>{ENGAGEMENT_LABELS[rec.engagement_type] ?? rec.engagement_type}</Row>
          <Row label={T.create.priorityScore}>
            <span className="font-mono" dir="ltr">
              {rec.priority_score}
            </span>
          </Row>
        </dl>
        {facts.stepsTotal ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[12px] text-ink-soft">{T.case.progress}</p>
            <ProgressBar value={facts.progress} label={T.case.progress} tone={facts.progress === 100 ? "success" : "primary"} />
          </div>
        ) : null}
      </RailCard>

      <section className="rounded-2xl border border-ai/20 bg-ai/[0.04] px-4 py-1">
        <ExpandableSection summary={T.caseView.aiSummary}>
          <div className="pb-3">
            <p className="mb-3 inline-flex items-center gap-1.5 text-[11.5px] text-ai-dark">
              <BrainCircuit className="size-3.5" aria-hidden />
              {T.dashboard.advisoryBelow}
            </p>
            <AISummaryPanel role={role} recommendationId={rec.id} />
          </div>
        </ExpandableSection>
      </section>
    </div>
  );
}
