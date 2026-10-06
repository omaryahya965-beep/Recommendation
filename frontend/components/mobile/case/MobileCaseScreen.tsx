"use client";

import { ArrowUpRight, CheckCircle2, Hourglass, Info, Paperclip, Repeat2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BlockerList } from "@/components/case/BlockerList";
import { EvidenceUploadForm } from "@/components/evidence/EvidenceUploadForm";
import { MobileSteps } from "@/components/mobile/case/MobileSteps";
import { StageChips } from "@/components/mobile/case/StageChips";
import { Sheet } from "@/components/mobile/Sheet";
import { StickyActionBar } from "@/components/mobile/StickyActionBar";
import { Button, ErrorBanner, SuccessBanner } from "@/components/ui/Base";
import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { ActionPanel, OutstandingRequest } from "@/components/workspace/ActionPanel";
import { DeadlineChip } from "@/components/workspace/ActionCard";
import { CaseSection } from "@/components/workspace/CaseSections";
import {
  RecurrencePanel,
  SECTION_ICON,
  SectionBody,
  sectionSummary,
  sectionTitle,
} from "@/components/workspace/sectionContent";
import { SideRail } from "@/components/workspace/SideRail";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { dayCount, formatDate } from "@/lib/format";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";
import {
  defaultOpenSection,
  isExecutionDesk,
  SECTION_IDS,
  sectionFacts,
  type SectionId,
} from "@/lib/viewmodels/caseView";
import { canAct, caseAction, closedTitle, isOffered, STATUS_NEXT_ACTION } from "@/lib/workflow";

type SheetKind = "action" | "evidence";

/** Whose turn, what, and by when — the first card on the phone case screen. */
function StatusHero({ rec, role }: { rec: RecommendationDetail; role: Role }) {
  useI18n();
  const workflow = rec.workflow;
  const closed = rec.status === "closed";
  const primary = workflow?.primary_action ?? null;
  const mine = !closed && Boolean(workflow?.my_turn || primary);
  const next = STATUS_NEXT_ACTION[rec.status];
  const deadline = workflow?.deadline ?? null;
  const waiting =
    workflow && !closed && workflow.waiting_on !== "none"
      ? (workflow.days_waiting > 0 ? T.workflow.waitingSince : T.workflow.waitingToday)
          .replace("{who}", T.workflow.waitingOn[workflow.waiting_on])
          .replace("{days}", dayCount(workflow.days_waiting, "genitive"))
      : null;
  const report = workflow?.report_action ?? null;

  return (
    <section
      className={cn(
        "rounded-2xl p-4",
        closed ? "bg-success-light/50" : mine ? "bg-inverse text-on-inverse" : "bg-primary-light/45"
      )}
      aria-labelledby="mobile-case-action"
      data-testid="mobile-status-hero"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-[12px] font-bold",
            closed ? "text-success-dark" : mine ? "text-white/70" : "text-primary-dark"
          )}
        >
          {closed ? T.workflow.noAction : mine ? T.mobile.yourTurn : T.workflow.currentAction}
        </p>
        <DeadlineChip rec={rec} inverse={mine} />
      </div>
      <h2
        id="mobile-case-action"
        className={cn("mt-1.5 font-heading text-[18px] font-bold leading-snug", mine ? "text-white" : closed ? "text-success-dark" : "text-navy")}
      >
        {closed ? closedTitle(rec.resolution) : mine && primary ? T.caseView.actions[primary] : next.action}
      </h2>
      {waiting ? (
        <p className={cn("mt-1 inline-flex items-center gap-1.5 text-[12.5px]", mine ? "text-white/75" : "text-ink-soft")}>
          <Hourglass className="size-3.5" aria-hidden />
          {waiting}
        </p>
      ) : null}
      {!closed ? (
        <dl className={cn("mt-3 grid grid-cols-2 gap-3 rounded-xl p-3", mine ? "bg-white/[0.07]" : "bg-surface/70")}>
          <div className="min-w-0">
            <dt className={cn("text-[11.5px]", mine ? "text-white/60" : "text-muted")}>{T.common.responsible}</dt>
            <dd className={cn("mt-0.5 truncate text-[13.5px] font-bold", mine ? "text-white" : "text-ink")}>
              {workflow?.next_actor?.user?.name ?? next.role}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={cn("truncate text-[11.5px]", mine ? "text-white/60" : "text-muted")}>
              {deadline ? T.workflow.deadlineSource[deadline.source] : T.workflow.bindingDeadline}
            </dt>
            <dd className={cn("mt-0.5 font-mono text-[13.5px] font-bold", mine ? "text-white" : "text-ink")} dir="ltr">
              {deadline ? formatDate(deadline.date) : "—"}
            </dd>
          </div>
        </dl>
      ) : null}
      {report ? (
        <Link
          href={role === "council" ? "/council/pending-approvals" : `/audit/reports/${report.report}`}
          className={cn(
            "mt-3 flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-[14px] font-bold",
            mine ? "bg-white text-navy" : "bg-primary text-white"
          )}
        >
          {T.caseView.reportActions[report.id]}
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}

/**
 * One recommendation case on a phone: the status card, the stage chips, the
 * steps as cards when the viewer is implementing, the record as an
 * accordion, and the viewer's action as a sticky button that opens its form
 * in a sheet. Every form is the same component the desktop workspace uses.
 */
export function MobileCaseScreen({
  rec,
  role,
  action,
  requirePlan,
  linked,
  savedNotice,
}: {
  rec: RecommendationDetail;
  role: Role;
  action: WorkflowAction;
  requirePlan: boolean;
  /** A section named in the link (?section= / ?tab=). */
  linked: SectionId | null;
  savedNotice: boolean;
}) {
  useI18n();
  const facts = sectionFacts(rec);
  const primary = rec.workflow?.primary_action ?? null;
  const desk = isExecutionDesk(primary);
  const [opened, setOpened] = useState<Partial<Record<SectionId | "details", boolean>>>({});
  const [sheet, setSheet] = useState<{ kind: SheetKind; at: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  // A linked section opens on its own, so the action card stays just above it.
  const initial = new Set<SectionId>([linked ?? defaultOpenSection(rec)]);
  const isOpen = (id: SectionId | "details") => opened[id] ?? (id !== "details" && initial.has(id));
  const toggle = (id: SectionId | "details") => setOpened((current) => ({ ...current, [id]: !isOpen(id) }));

  // The action form closes itself once its submission succeeds.
  const submittedAfterOpen =
    sheet !== null && action.mutation.isSuccess && action.mutation.submittedAt >= sheet.at;
  const sheetOpen = sheet !== null && !submittedAfterOpen;
  const openSheet = (kind: SheetKind) => {
    setDirty(false);
    setSheet({ kind, at: Date.now() });
  };

  const canSubmit = isOffered(rec, "mark_implemented");
  const canUpload = isOffered(rec, "upload_evidence");
  const markBlockers = caseAction(rec, "mark_implemented")?.blockers;

  let sticky: React.ReactNode = null;
  if (desk) {
    sticky = (
      <div className="flex gap-2">
        {canUpload ? (
          <Button
            type="button"
            variant={canSubmit && canAct(rec, "mark_implemented") ? "ghost" : "primary"}
            className={cn("min-h-12 flex-1 font-bold", canSubmit && canAct(rec, "mark_implemented") && "ring-1 ring-line")}
            onClick={() => openSheet("evidence")}
          >
            <Paperclip className="size-4" aria-hidden />
            {T.caseView.actions.upload_evidence}
          </Button>
        ) : null}
        {canSubmit ? (
          <Button
            type="button"
            className="min-h-12 flex-1 font-bold"
            disabled={action.mutation.isPending || !canAct(rec, "mark_implemented")}
            onClick={() => action.mutation.mutate({ path: "mark-implemented/" })}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {T.plan.markImplemented}
          </Button>
        ) : null}
      </div>
    );
  } else if (primary && primary !== "edit_draft") {
    sticky = (
      <Button type="button" className="min-h-12 w-full font-bold" onClick={() => openSheet("action")}>
        {T.caseView.actions[primary]}
      </Button>
    );
  } else if (primary === "edit_draft") {
    sticky = (
      <Link
        href={`/audit/recommendations/${rec.id}/edit`}
        className="flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-bold text-white"
      >
        {T.create.editAction}
      </Link>
    );
  }

  return (
    <div className="space-y-4 pb-2" data-testid="mobile-case">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <RecordId id={rec.id} />
          <StatusBadge status={rec.status} />
          <RiskBadge level={rec.risk_level} />
          {rec.is_recurring ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-light/60 px-2 py-0.5 text-[11.5px] font-bold text-warning-dark">
              <Repeat2 className="size-3" aria-hidden />
              {rec.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 font-heading text-[19px] font-bold leading-snug text-navy"><bdi>{clipTitle(rec.title, 140)}</bdi></h1>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">{rec.department_name}</p>
      </header>

      <SuccessBanner message={action.success ?? (savedNotice ? T.create.editSaved : null)} />
      {action.error && !primary ? <ErrorBanner message={action.error} /> : null}
      <StatusHero rec={rec} role={role} />
      <StageChips rec={rec} />

      {desk ? (
        <section className="space-y-3">
          <OutstandingRequest rec={rec} />
          <h2 className="font-heading text-[16px] font-bold text-navy">{T.caseView.desk.steps}</h2>
          <MobileSteps rec={rec} action={action} />
          {canSubmit && markBlockers?.length ? <BlockerList blockers={markBlockers} /> : null}
        </section>
      ) : null}

      {isOffered(rec, "confirm_recurrence") && rec.is_recurring && !rec.recurrence_confirmed ? (
        <RecurrencePanel action={action} />
      ) : null}

      <div className="space-y-2.5">
        {SECTION_IDS.map((id) => (
          <CaseSection
            key={id}
            id={id}
            title={sectionTitle(id)}
            summary={sectionSummary(id, rec, facts)}
            icon={SECTION_ICON[id]}
            open={isOpen(id)}
            onToggle={() => toggle(id)}
          >
            <SectionBody id={id} rec={rec} action={action} deskOpen={desk} />
          </CaseSection>
        ))}
        <CaseSection
          id="details"
          title={T.mobile.details}
          summary={T.caseView.dates.title}
          icon={<Info className="size-4.5" />}
          open={isOpen("details")}
          onToggle={() => toggle("details")}
        >
          <SideRail rec={rec} role={role} />
        </CaseSection>
      </div>

      {sticky ? <StickyActionBar>{sticky}</StickyActionBar> : null}

      {sheet?.kind === "action" && primary ? (
        <Sheet
          open={sheetOpen}
          onClose={() => setSheet(null)}
          title={T.caseView.actions[primary]}
          size="full"
          dirty={dirty}
          testId="action-sheet"
        >
          <div onInput={() => setDirty(true)} id="case-action-panel">
            <ActionPanel rec={rec} action={action} requirePlan={requirePlan} />
          </div>
        </Sheet>
      ) : null}
      {sheet?.kind === "evidence" ? (
        <Sheet
          open={sheetOpen}
          onClose={() => setSheet(null)}
          title={T.caseView.actions.upload_evidence}
          size="full"
          dirty={dirty}
          testId="evidence-sheet"
        >
          <div onInput={() => setDirty(true)}>
            <EvidenceUploadForm rec={rec} action={action} allowCamera onUploaded={() => setSheet(null)} />
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
