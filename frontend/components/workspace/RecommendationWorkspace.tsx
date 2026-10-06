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

/**
 * One recommendation case. The action card (whose turn, by when, and the form
 * when it is this user's turn) comes first; the record follows as collapsible
 * sections; dates, people and context sit in a side rail.
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
      />
      <CaseTimeline rec={rec} />

      {/* Two columns from 1280px. At 1024–1279 the full sidebar leaves ~700px,
          and a side rail beside the forms would squeeze them to ~390px, so the
          rail stacks below as on tablets. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
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

          <div>
            <div className="mb-2.5 flex items-center justify-end" data-print="hide">
              <button
                type="button"
                onClick={() => setAll(!allOpen)}
                className="min-h-9 rounded-md px-2 text-[12.5px] font-semibold text-primary-dark hover:underline"
              >
                {allOpen ? T.caseView.collapseAll : T.caseView.expandAll}
              </button>
            </div>
            <div className="space-y-3">
              {SECTION_IDS.map((section) => (
                <CaseSection
                  key={section}
                  id={section}
                  title={sectionTitle(section)}
                  summary={sectionSummary(section, rec, facts)}
                  count={
                    section === "evidence"
                      ? facts.files
                      : section === "decisions"
                        ? facts.decisions
                        : section === "plan"
                          ? facts.stepsTotal
                          : null
                  }
                  icon={SECTION_ICON[section]}
                  open={isOpen(section)}
                  onToggle={() => setOpen(section, !isOpen(section))}
                >
                  <SectionBody id={section} rec={rec} action={action} deskOpen={deskOpen} />
                </CaseSection>
              ))}
            </div>
          </div>
        </div>

        <aside className="min-w-0" aria-label={T.mobile.details}>
          <SideRail rec={rec} role={role} />
        </aside>
      </div>
    </div>
  );
}
