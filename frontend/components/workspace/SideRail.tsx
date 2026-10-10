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

function RailGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 px-4 py-4 md:px-5">
      <h3 className="mb-2.5 inline-flex items-center gap-2 text-[13px] font-bold text-navy">
        <span className="text-muted" aria-hidden>
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, children, emphasis }: { label: string; children: ReactNode; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1.5",
        emphasis && "-mx-2 my-0.5 rounded-lg bg-primary-light/45 px-2 ring-1 ring-inset ring-primary/15"
      )}
    >
      <dt className={cn("shrink-0 text-[12.5px]", emphasis ? "font-semibold text-primary-dark" : "text-ink-soft")}>{label}</dt>
      {/* Long values (a department's full name) wrap instead of widening the page. */}
      <dd className={cn("min-w-0 break-words text-end text-[12.5px]", emphasis ? "font-bold text-navy" : "font-semibold text-ink")}>
        {children}
      </dd>
    </div>
  );
}

/** The first letter of a name, for the people list's avatar. */
function initial(name: string): string {
  return Array.from(name.trim())[0] ?? "؟";
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
export function SideRail({
  rec,
  role,
  embedded = false,
}: {
  rec: RecommendationDetail;
  role: Role;
  /** Inside the phone's "details" section: no card of its own. */
  embedded?: boolean;
}) {
  useI18n();
  const dates = keyDates(rec);
  const people = casePeople(rec);
  const facts = sectionFacts(rec);
  const href = reportHref(role, rec);
  const sameDeadline = dates.bindingDeadline && dates.bindingDeadline === dates.planTarget;

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* One card. Below 1280px it sits under the record with its three
          groups side by side; beside the record they stack. */}
      <div
        data-testid="case-details"
        className={cn(
          "grid grid-cols-1 divide-y divide-line/70",
          !embedded &&
            "overflow-hidden rounded-2xl border border-line bg-surface shadow-section md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-1 xl:divide-x-0 xl:divide-y",
          embedded && "-mx-4 -my-5 md:-mx-6"
        )}
      >
        <RailGroup title={T.caseView.dates.title} icon={<CalendarDays className="size-4" />}>
          <dl className="divide-y divide-line/60">
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
        </RailGroup>

        {people.length ? (
          <RailGroup title={T.caseView.people.title} icon={<Users className="size-4" />}>
            <ul className="space-y-2.5">
              {people.map((person) => (
                <li key={person.key} className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-[12.5px] font-bold text-ink-soft ring-1 ring-line/70"
                    aria-hidden
                  >
                    {initial(person.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{person.name}</span>
                    <span className="block text-[11.5px] text-muted">{T.caseView.people[person.part]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </RailGroup>
        ) : null}

        <RailGroup title={T.caseView.context.title} icon={<FileText className="size-4" />}>
          <p className="text-[13px] font-semibold leading-snug text-ink"><bdi>{rec.report_title}</bdi></p>
          {href ? (
            <Link href={href} className="mt-0.5 inline-flex min-h-9 items-center text-[12.5px] font-bold text-primary-dark hover:underline">
              {role === "audit" ? T.caseView.context.openReport : T.caseView.context.reportCases}
            </Link>
          ) : null}
          <dl className="mt-1.5 divide-y divide-line/60 border-t border-line/60">
            <Row label={T.common.department}>{rec.department_name}</Row>
            <Row label={T.caseView.context.engagement}>{ENGAGEMENT_LABELS[rec.engagement_type] ?? rec.engagement_type}</Row>
            <Row label={T.create.priorityScore}>
              <span className="font-mono" dir="ltr">
                {rec.priority_score}
              </span>
            </Row>
          </dl>
          {facts.stepsTotal ? (
            <div className="mt-3 rounded-xl bg-subtle/60 px-3 py-2.5">
              <p className="mb-1.5 flex items-baseline justify-between text-[12px] text-ink-soft">
                {T.case.progress}
                <span className="font-mono font-bold text-ink" dir="ltr">
                  {facts.progress}%
                </span>
              </p>
              <ProgressBar value={facts.progress} label={T.case.progress} tone={facts.progress === 100 ? "success" : "primary"} showValue={false} />
            </div>
          ) : null}
        </RailGroup>
      </div>

      <section className="rounded-2xl border border-ai/20 bg-ai/[0.04] px-4 py-1" data-print="hide">
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
