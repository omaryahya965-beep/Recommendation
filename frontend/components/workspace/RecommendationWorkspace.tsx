"use client";

import { Printer, SearchX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CaseSkeleton } from "@/components/case/CaseHeader";
import { Button, ErrorBanner, SuccessBanner } from "@/components/ui/Base";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionCard } from "@/components/workspace/ActionCard";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { CaseHeaderBar } from "@/components/workspace/CaseHeaderBar";
import { CaseSection } from "@/components/workspace/CaseSections";
import {
  RecurrencePanel,
  SECTION_ICON,
  SectionBody,
  sectionRowSummary,
  sectionStatus,
  sectionSummary,
  sectionTitle,
} from "@/components/workspace/sectionContent";
import { CaseTimeline } from "@/components/workspace/CaseTimeline";
import { SideRail } from "@/components/workspace/SideRail";
import { MobileCaseScreen } from "@/components/mobile/case/MobileCaseScreen";
import { ApiError } from "@/lib/api";
import { useRecommendation, useWorkflowAction, useWorkflowPolicy } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationStatus, Role } from "@/lib/types";
import {
  defaultOpenSection,
  isExecutionDesk,
  SECTION_IDS,
  sectionFacts,
  sectionFromQuery,
  type SectionId,
} from "@/lib/viewmodels/caseView";
import { useIsPhone } from "@/lib/useMediaQuery";
import { isOffered } from "@/lib/workflow";

function backLink(role: Role, status?: RecommendationStatus): { href: string; label: string } {
  if (role === "council") {
    // Back to the council queue the case sits in, else the register.
    if (status === "pending_council") return { href: "/council/pending-approvals", label: T.nav.pendingApprovals };
    if (status === "pending_closure_council") return { href: "/council/closure-reviews", label: T.nav.closureReviews };
    return { href: "/council/recommendations", label: T.nav.recommendations };
  }
  const map: Record<Exclude<Role, "council">, { href: string; label: string }> = {
    audit: { href: "/audit/recommendations", label: T.register.title },
    department_head: { href: "/department/recommendations", label: T.register.title },
    employee: { href: "/employee/my-tasks", label: T.nav.myTasks },
  };
  return map[role];
}

/** The working record, in stage order, and the reference sections after it. */
const RECORD_SECTIONS: SectionId[] = ["finding", "response", "plan", "evidence", "verification"];
const TRAIL_SECTIONS: SectionId[] = ["decisions", "history"];

/**
 * One recommendation case. A header card (what the case is, and the stage
 * timeline) leads; the action card (whose turn, by when, and the form when it
 * is this user's turn) opens the working column, followed by the record in
 * one frame and the decisions/history in a lighter one. Dates, people and
 * context sit in a side rail.
 */
export function RecommendationWorkspace({ id, role }: { id: number; role: Role }) {
  useI18n();
  const { data: rec, isLoading, isError, error, refetch } = useRecommendation(id);
  const action = useWorkflowAction(id);
  const { data: policy } = useWorkflowPolicy();
  const searchParams = useSearchParams();
  const linked = sectionFromQuery(searchParams.get("section") ?? searchParams.get("tab"));
  // Sections the user opened or closed, per case (a different case starts fresh).
  const [toggled, setToggled] = useState<{ recId: number; open: Partial<Record<SectionId, boolean>> }>({
    recId: id,
    open: {},
  });

  const phone = useIsPhone();

  // A link to a section (?section=, from a notification or a home queue)
  // opens it and brings it into view once the case has loaded.
  const loadedId = rec?.id;
  useEffect(() => {
    if (!linked || loadedId !== id) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`section-${linked}`)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [linked, loadedId, id]);

  const back = backLink(role, rec?.status);
  if (isLoading) return <CaseSkeleton id={id} backHref={back.href} backLabel={back.label} />;
  // A case that does not exist or is outside the viewer's scope: retrying
  // cannot help, so say so and lead back to the list.
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden />}
        title={T.caseView.unavailableTitle}
        description={T.errors.notFoundDescription}
        actions={
          <Link
            href={back.href}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-dark"
          >
            {back.label}
          </Link>
        }
      />
    );
  }
  if (isError || !rec) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  if (phone) {
    return (
      <MobileCaseScreen
        rec={rec}
        role={role}
        action={action}
        requirePlan={policy?.require_plan_with_response ?? false}
        linked={linked}
        savedNotice={Boolean(searchParams.get("saved"))}
      />
    );
  }

  const facts = sectionFacts(rec);
  const primary = rec.workflow?.primary_action ?? null;
  const deskOpen = isExecutionDesk(primary);
  // A linked section opens on its own, so the action card stays just above it.
  const initial = new Set<SectionId>([linked ?? defaultOpenSection(rec)]);
  const choices = toggled.recId === id ? toggled.open : {};
  const isOpen = (section: SectionId) => choices[section] ?? initial.has(section);
  const setOpen = (section: SectionId, open: boolean) =>
    setToggled((current) => ({
      recId: id,
      open: { ...(current.recId === id ? current.open : {}), [section]: open },
    }));
  const allOpen = SECTION_IDS.every(isOpen);
  // The whole record on paper: open every section, let it render, then print.
  const printCase = () => {
    setAll(true);
    window.setTimeout(() => window.print(), 150);
  };
  const setAll = (open: boolean) =>
    setToggled({ recId: id, open: Object.fromEntries(SECTION_IDS.map((section) => [section, open])) });

  const sectionProps = (section: SectionId) => ({
    id: section,
    title: sectionTitle(section),
    count: section === "evidence" ? facts.files : section === "decisions" ? facts.decisions : null,
    icon: SECTION_ICON[section],
    open: isOpen(section),
    onToggle: () => setOpen(section, !isOpen(section)),
  });

  return (
    <div className="space-y-5">
      <CaseHeaderBar
        rec={rec}
        backHref={back.href}
        backLabel={back.label}
        actions={
          <Button type="button" variant="ghost" className="min-h-10 gap-1.5 font-bold" onClick={printCase}>
            <Printer className="size-4" aria-hidden />
            {T.caseView.print}
          </Button>
        }
      >
        <CaseTimeline rec={rec} embedded />
      </CaseHeaderBar>

      {/* Two columns from 1280px, the rail about 30%. At 1024–1279 the full
          sidebar leaves ~700px, and a rail beside the forms would squeeze them
          to ~390px, so the rail stacks below with its groups side by side. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,30%)] 2xl:gap-6">
        <div className="min-w-0 space-y-5">
          <SuccessBanner message={action.success ?? (searchParams.get("saved") ? T.create.editSaved : null)} />
          {/* A refused action whose form is gone (the case moved on) still says why. */}
          {action.error && !primary ? <ErrorBanner message={action.error} /> : null}
          <ActionCard rec={rec} role={role}>
            {primary ? (
              <ActionPanel rec={rec} action={action} requirePlan={policy?.require_plan_with_response ?? false} />
            ) : null}
          </ActionCard>
          {isOffered(rec, "confirm_recurrence") && rec.is_recurring && !rec.recurrence_confirmed ? (
            <RecurrencePanel action={action} />
          ) : null}

          {/* The record: the working sections in stage order, in one frame. */}
          <section
            aria-labelledby="case-record-title"
            className="overflow-hidden rounded-2xl border border-line bg-surface shadow-section"
          >
            <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3 md:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
                <h2 id="case-record-title" className="font-heading text-[15.5px] font-bold text-navy">
                  {T.caseView.recordTitle}
                </h2>
                <p className="hidden truncate text-[12.5px] text-muted lg:block">{T.caseView.recordHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setAll(!allOpen)}
                data-print="hide"
                className="min-h-9 shrink-0 rounded-md px-2 text-[12.5px] font-semibold text-primary-dark hover:underline"
              >
                {allOpen ? T.caseView.collapseAll : T.caseView.expandAll}
              </button>
            </header>
            <div className="divide-y divide-line/70">
              {RECORD_SECTIONS.map((section) => (
                <CaseSection
                  key={section}
                  {...sectionProps(section)}
                  variant="row"
                  summary={sectionRowSummary(section, rec, facts)}
                  status={sectionStatus(section, rec, facts)}
                >
                  <SectionBody id={section} rec={rec} action={action} deskOpen={deskOpen} />
                </CaseSection>
              ))}
            </div>
          </section>

          {/* Decisions and the trail: reference material, drawn lighter. */}
          <section aria-labelledby="case-trail-title" className="rounded-2xl border border-line/80 bg-subtle/40">
            <h2 id="case-trail-title" className="px-4 pb-1 pt-3 text-[12.5px] font-bold text-muted md:px-5">
              {T.caseView.trailTitle}
            </h2>
            <div className="divide-y divide-line/60">
              {TRAIL_SECTIONS.map((section) => (
                <CaseSection
                  key={section}
                  {...sectionProps(section)}
                  variant="quiet"
                  summary={sectionSummary(section, rec, facts)}
                >
                  <SectionBody id={section} rec={rec} action={action} deskOpen={deskOpen} />
                </CaseSection>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0" aria-label={T.caseView.detailsTitle}>
          <SideRail rec={rec} role={role} />
        </aside>
      </div>
    </div>
  );
}
