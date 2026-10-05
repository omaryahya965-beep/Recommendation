"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { CaseSkeleton } from "@/components/case/CaseHeader";
import { Button, ErrorBanner, SuccessBanner } from "@/components/ui/Base";
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
import { useRecommendation, useWorkflowAction, useWorkflowPolicy } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";
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

function backLink(role: Role): { href: string; label: string } {
  const map: Record<Role, { href: string; label: string }> = {
    audit: { href: "/audit/recommendations", label: T.register.title },
    department_head: { href: "/department/recommendations", label: T.register.title },
    employee: { href: "/employee/my-tasks", label: T.nav.myTasks },
    council: { href: "/council/pending-approvals", label: T.nav.pendingApprovals },
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
  const { data: rec, isLoading, isError, refetch } = useRecommendation(id);
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

  const back = backLink(role);
  if (isLoading) return <CaseSkeleton id={id} backHref={back.href} backLabel={back.label} />;
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
  const initial = new Set<SectionId>([defaultOpenSection(rec), ...(linked ? [linked] : [])]);
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.5rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <SuccessBanner message={action.success ?? (searchParams.get("saved") ? T.create.editSaved : null)} />
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

        <aside className="min-w-0">
          <SideRail rec={rec} role={role} />
        </aside>
      </div>
    </div>
  );
}
