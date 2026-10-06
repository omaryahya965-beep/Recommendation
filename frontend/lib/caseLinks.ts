/**
 * Links into a case at the part of the file where its current work is
 * (`?section=` opens and scrolls to that section), shared by the home queues
 * and the notifications.
 */
import { currentT } from "./i18n/messages";
import type { RecommendationStatus } from "./types";
import type { SectionId } from "./viewmodels/caseView";

const SECTION_BY_STATUS: Record<RecommendationStatus, SectionId> = {
  draft: "finding",
  // The department answers the finding; a returned answer carries audit's notes.
  pending_response: "finding",
  returned_for_revision: "response",
  audit_review: "response",
  pending_council: "decisions",
  approved_for_implementation: "plan",
  action_plan_required: "plan",
  action_plan_review: "plan",
  revision_required: "plan",
  action_plan_approved: "plan",
  in_progress: "plan",
  pending_head_review: "evidence",
  submitted_for_verification: "evidence",
  // Returned after verification: the decision says what is missing.
  returned_insufficient: "verification",
  partial: "verification",
  reopened: "verification",
  closure_review: "verification",
  pending_closure_council: "verification",
  closed: "decisions",
};

export function sectionForStatus(status: RecommendationStatus | null | undefined): SectionId | null {
  return status ? (SECTION_BY_STATUS[status] ?? null) : null;
}

export function caseHref(base: string, id: number, section?: SectionId | null): string {
  return section ? `${base}/${id}?section=${section}` : `${base}/${id}`;
}

/** A section's name, without loading the workspace (the bell is on every page). */
export function sectionLabel(id: SectionId): string {
  const T = currentT();
  const labels: Record<SectionId, string> = {
    finding: T.case.finding,
    response: T.case.response,
    plan: T.case.plan,
    evidence: T.case.evidence,
    verification: T.case.verification,
    decisions: T.caseView.decisions,
    history: T.caseView.history,
  };
  return labels[id];
}
