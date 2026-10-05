/**
 * The view model of one recommendation case, shared by the desktop workspace
 * and the mobile case screen. Pure functions over the API payload — nothing
 * here decides permissions (that is the server's `workflow` block); it only
 * arranges what the server said for people to read.
 */
import { STAGE_IDS, STATUS_STAGE } from "../contract";
import { planProgress } from "../case";
import type {
  CaseActionId,
  RecommendationDetail,
  RecommendationStatus,
  StageId,
  TrailEntry,
  User,
} from "../types";

/* ------------------------------------------------------------------ */
/* Stage timeline                                                      */
/* ------------------------------------------------------------------ */

export type TimelineState = "completed" | "current" | "returned" | "next";

export interface TimelineStage {
  id: StageId;
  state: TimelineState;
  /** First time the case entered this stage (null when it never did). */
  enteredAt: string | null;
  /** Who moved it into the stage (the actor of that transition). */
  enteredBy: string | null;
  /** How many times the case was sent back into this stage. */
  returns: number;
}

/** Statuses that mean "sent back for more work". */
export const RETURNED_STATUSES: readonly RecommendationStatus[] = [
  "returned_for_revision",
  "revision_required",
  "returned_insufficient",
  "partial",
  "reopened",
];

function transitions(trail: TrailEntry[]) {
  return trail
    .filter((entry) => typeof entry.metadata?.to_status === "string")
    .map((entry) => ({ entry, to: entry.metadata.to_status as RecommendationStatus }));
}

export function stageTimeline(
  rec: Pick<RecommendationDetail, "status" | "trail" | "created_at">
): TimelineStage[] {
  const moves = transitions(rec.trail ?? []);
  const currentIndex = STAGE_IDS.indexOf(STATUS_STAGE[rec.status]);
  const closed = rec.status === "closed";
  const returnedNow = RETURNED_STATUSES.includes(rec.status);
  return STAGE_IDS.map((id, index) => {
    const into = moves.filter((move) => STATUS_STAGE[move.to] === id);
    const first = into[0];
    let state: TimelineState = "next";
    if (closed || index < currentIndex) state = "completed";
    else if (index === currentIndex) state = returnedNow ? "returned" : "current";
    return {
      id,
      state,
      enteredAt: id === "preparation" ? rec.created_at : (first?.entry.created_at ?? null),
      enteredBy: first ? first.entry.user_full_name || first.entry.user || null : null,
      returns: into.filter((move) => RETURNED_STATUSES.includes(move.to)).length,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Key dates and people                                                */
/* ------------------------------------------------------------------ */

export interface KeyDates {
  created: string;
  issued: string | null;
  ratified: string | null;
  planApproved: string | null;
  planTarget: string | null;
  bindingDeadline: string | null;
  closed: string | null;
}

function firstMove(trail: TrailEntry[], to: RecommendationStatus): string | null {
  return transitions(trail).find((move) => move.to === to)?.entry.created_at ?? null;
}

export function keyDates(rec: RecommendationDetail): KeyDates {
  const trail = rec.trail ?? [];
  return {
    created: rec.created_at,
    issued: firstMove(trail, "pending_response"),
    ratified:
      rec.approvals?.find((item) => item.approval_type === "council_ratification")?.created_at ??
      firstMove(trail, "approved_for_implementation"),
    planApproved: firstMove(trail, "action_plan_approved"),
    planTarget: rec.action_plan?.target_date ?? null,
    bindingDeadline: rec.workflow?.deadline?.date ?? null,
    closed: rec.closed_at ?? null,
  };
}

export type PersonPart = "responsible" | "respondent" | "ratifier" | "verifier" | "closer";

export interface CasePerson {
  key: string;
  name: string;
  part: PersonPart;
}

function displayName(user: User | null | undefined) {
  return user ? user.full_name_ar || user.username : null;
}

export function casePeople(rec: RecommendationDetail): CasePerson[] {
  const people: CasePerson[] = [];
  const add = (part: PersonPart, user: User | null | undefined) => {
    const name = displayName(user);
    if (name) people.push({ key: `${part}-${user?.id ?? name}`, name, part });
  };
  const approval = (type: string) => rec.approvals?.find((item) => item.approval_type === type);
  const verifications = rec.verifications ?? [];
  add("responsible", rec.action_plan?.responsible_employee_detail);
  add("respondent", rec.response?.submitted_by_detail);
  add("ratifier", approval("council_ratification")?.approved_by_detail);
  // Oldest first from the API: the latest decision is the last one.
  add("verifier", verifications[verifications.length - 1]?.reviewed_by_detail);
  add("closer", approval("closure_council")?.approved_by_detail);
  return people;
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export const SECTION_IDS = [
  "finding",
  "response",
  "plan",
  "evidence",
  "verification",
  "decisions",
  "history",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Section names in deep links, including the tab names of the old layout. */
export function sectionFromQuery(value: string | null): SectionId | null {
  if (!value) return null;
  if ((SECTION_IDS as readonly string[]).includes(value)) return value as SectionId;
  if (value === "approvals") return "decisions";
  if (value === "trail") return "history";
  return null;
}

const EXECUTION_ACTIONS: readonly CaseActionId[] = ["update_progress", "upload_evidence", "mark_implemented"];

/** Whether the action panel is the execution desk (steps, upload, submit). */
export function isExecutionDesk(primary: CaseActionId | null | undefined): boolean {
  return Boolean(primary && EXECUTION_ACTIONS.includes(primary));
}

/**
 * The record section to open first: the one that best complements the action
 * panel above it (the panel already shows what the decision needs), or —
 * when there is nothing to do — the part of the file the case is in.
 */
export function defaultOpenSection(rec: RecommendationDetail): SectionId {
  const primary = rec.workflow?.primary_action ?? null;
  const returned = RETURNED_STATUSES.includes(rec.status);
  if (primary) {
    if (isExecutionDesk(primary)) return returned ? "verification" : "evidence";
    const byAction: Partial<Record<CaseActionId, SectionId>> = {
      edit_draft: "finding",
      respond: "finding",
      review_response: "response",
      submit_plan: "finding",
      review_plan: "finding",
      review_implementation: "evidence",
      verify: "evidence",
      submit_for_closure: "verification",
      // The closure panel already shows the latest decision.
      council_closure: "evidence",
    };
    const section = byAction[primary];
    if (section) return section;
  }
  switch (STATUS_STAGE[rec.status]) {
    case "preparation":
      return "finding";
    case "response":
      return rec.response ? "response" : "finding";
    case "audit_review":
    case "council":
      return "response";
    case "plan":
      return rec.action_plan ? "plan" : "response";
    case "execution":
    case "head_review":
      return "plan";
    case "verification":
      return "evidence";
    case "closure":
      return "verification";
    default:
      return "decisions";
  }
}

/** Counts behind each section's one-line summary. */
export interface SectionFacts {
  responseDecision: "agree" | "disagree" | null;
  responseReview: "pending" | "accepted" | "rejected" | null;
  stepsDone: number;
  stepsTotal: number;
  progress: number;
  files: number;
  latestVerification: "sufficient" | "partial" | "insufficient" | null;
  decisions: number;
  events: number;
}

export function sectionFacts(rec: RecommendationDetail): SectionFacts {
  const steps = rec.action_plan?.steps ?? [];
  const verifications = rec.verifications ?? [];
  return {
    responseDecision: rec.response?.decision ?? null,
    responseReview: rec.response?.review_status ?? null,
    stepsDone: steps.filter((step) => step.is_done).length,
    stepsTotal: steps.length,
    progress: planProgress(rec.action_plan),
    files: rec.evidence_files?.length ?? 0,
    latestVerification: verifications[verifications.length - 1]?.decision ?? null,
    decisions: rec.approvals?.length ?? 0,
    events: rec.trail?.length ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export type HistoryFilter = "decisions" | "files" | "all";

const FILE_ACTIONS = new Set(["evidence_uploaded", "evidence_deleted", "evidence_downloaded"]);

/** Trail entries for one history filter, newest first. */
export function historyEntries(trail: TrailEntry[], filter: HistoryFilter): TrailEntry[] {
  const newest = [...trail].reverse();
  if (filter === "all") return newest;
  if (filter === "files") return newest.filter((entry) => FILE_ACTIONS.has(entry.action));
  return newest.filter((entry) => typeof entry.metadata?.to_status === "string");
}
