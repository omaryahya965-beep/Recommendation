import type { ActionPlan, ActionStep, RecommendationDetail } from "./types";

/** Overall completion of an action plan, derived from real step progress. */
export function planProgress(plan: ActionPlan | null | undefined): number {
  if (!plan?.steps?.length) return 0;
  const total = plan.steps.reduce(
    (sum, step) => sum + (step.is_done ? 100 : Math.max(0, Math.min(100, step.progress_percent))),
    0
  );
  return Math.round(total / plan.steps.length);
}

export type StepState = "done" | "active" | "blocked" | "pending";

/**
 * A step is blocked while the step it depends on is unfinished — this mirrors
 * `ActionStep.depends_on`, the only dependency the backend models.
 */
export function stepState(step: ActionStep, all: ActionStep[]): StepState {
  if (step.is_done) return "done";
  if (step.depends_on !== null) {
    const parent = all.find((candidate) => candidate.id === step.depends_on);
    if (parent && !parent.is_done) return "blocked";
  }
  return step.progress_percent > 0 ? "active" : "pending";
}

export function sortSteps(steps: ActionStep[]): ActionStep[] {
  return [...steps].sort((a, b) => a.order - b.order || a.id - b.id);
}

/** Evidence grouped by the plan step it proves, plus anything unlinked. */
export function evidenceByStep(rec: RecommendationDetail) {
  const map = new Map<number | null, RecommendationDetail["evidence_files"]>();
  for (const item of rec.evidence_files ?? []) {
    const key = item.step ?? null;
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

/**
 * The most recent verification decision by time. The API lists them newest
 * first; never rely on list position (taking the last item showed a
 * superseded partial verification as current).
 */
type Verification = NonNullable<RecommendationDetail["verifications"]>[number];

/** Later decision first: by time, then by id for decisions saved in the same instant. */
function newerFirst(a: Verification, b: Verification) {
  const at = (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
  return at !== 0 ? at : b.id - a.id;
}

/**
 * Every verification decision, newest first, whatever order the API used
 * (it lists newest first; older code read the last item as the latest, which
 * made the summary show the oldest decision — round 2, 2.3).
 */
export function verificationsNewestFirst(rec: RecommendationDetail): Verification[] {
  return [...(rec.verifications ?? [])].sort(newerFirst);
}

export function latestVerification(rec: RecommendationDetail): Verification | null {
  return verificationsNewestFirst(rec)[0] ?? null;
}

/** Requirements still outstanding from the most recent non-sufficient verification. */
export function outstandingRequirements(rec: RecommendationDetail) {
  const latest = latestVerification(rec);
  if (!latest || latest.decision === "sufficient") return null;
  return latest;
}

/**
 * `accepted` — audit verified after this file was uploaded and found the package
 *   sufficient.
 * `rejected` — audit reviewed it and returned the case.
 * `in_review` — the case is sitting with audit awaiting a verdict.
 * `submitted` — uploaded, not yet put in front of audit.
 */
export type EvidenceReviewState = "submitted" | "in_review" | "accepted" | "rejected";

/**
 * The backend stores no review status on an evidence row; the verdict is
 * recorded once per recommendation on `VerificationDecision`. So an item's state
 * is inferred from whether a decision was taken after it was uploaded. Nothing
 * is invented — a file with no decision covering it is reported as unreviewed.
 */
export function evidenceReviewState(
  uploadedAt: string,
  rec: RecommendationDetail
): EvidenceReviewState {
  const uploaded = new Date(uploadedAt).getTime();

  const covering = (rec.verifications ?? [])
    .filter((decision) => new Date(decision.created_at).getTime() >= uploaded)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (covering) return covering.decision === "sufficient" ? "accepted" : "rejected";
  return rec.status === "submitted_for_verification" ? "in_review" : "submitted";
}
