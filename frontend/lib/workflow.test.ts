import { describe, expect, it } from "vitest";

import type { RecommendationDetail } from "./types";
import * as ar from "./i18n/ar";
import * as en from "./i18n/en";
import { setLocale } from "./i18n/store";
import {
  canAct,
  caseAction,
  closedTitle,
  isOffered,
  isWaitingOn,
  normalizeStageId,
  stageForStatus,
  stageIndexForStatus,
} from "./workflow";

describe("workflow view-model", () => {
  it("maps backend statuses onto the ten business stages", () => {
    expect(stageIndexForStatus("draft")).toBe(0);
    expect(stageIndexForStatus("pending_response")).toBe(1);
    expect(stageIndexForStatus("in_progress")).toBe(5);
    expect(stageIndexForStatus("pending_head_review")).toBe(6);
    expect(stageIndexForStatus("pending_closure_council")).toBe(8);
    expect(stageIndexForStatus("closed")).toBe(9);
    expect(stageForStatus("submitted_for_verification").id).toBe("verification");
    expect(stageForStatus("closure_review").id).toBe("verification");
  });

  it("knows who a status waits on", () => {
    expect(isWaitingOn("in_progress", "employee")).toBe(true);
    expect(isWaitingOn("pending_response", "employee")).toBe(false);
    expect(isWaitingOn("pending_response", "department_head")).toBe(true);
    expect(isWaitingOn("pending_closure_council", "council")).toBe(true);
  });

  it("accepts old nine-stage ids in saved links", () => {
    expect(normalizeStageId("verify")).toBe("verification");
    expect(normalizeStageId("finding")).toBe("preparation");
    expect(normalizeStageId("execution")).toBe("execution");
    expect(normalizeStageId("nonsense")).toBeNull();
  });
});

describe("actions come from the server", () => {
  const rec = {
    workflow: {
      available_actions: [
        { id: "upload_evidence", enabled: true, blockers: [] },
        { id: "mark_implemented", enabled: false, blockers: [{ code: "evidence_required" }] },
      ],
    },
  } as unknown as RecommendationDetail;

  it("offers exactly what the API offered", () => {
    expect(isOffered(rec, "upload_evidence")).toBe(true);
    expect(canAct(rec, "upload_evidence")).toBe(true);
    expect(isOffered(rec, "verify")).toBe(false);
  });

  it("keeps offered-but-blocked actions disabled with their reasons", () => {
    expect(isOffered(rec, "mark_implemented")).toBe(true);
    expect(canAct(rec, "mark_implemented")).toBe(false);
    expect(caseAction(rec, "mark_implemented")?.blockers[0].code).toBe("evidence_required");
  });

  it("offers nothing without a workflow block", () => {
    expect(canAct({ workflow: null }, "respond")).toBe(false);
    expect(canAct(null, "respond")).toBe(false);
  });
});

describe("closed cases say how they ended", () => {
  it("uses the contract label for the resolution, in the active locale", () => {
    setLocale("ar");
    expect(closedTitle("disagreement_accepted")).toBe(`${ar.STATUS_LABELS.closed} — ${ar.RESOLUTION_LABELS.disagreement_accepted}`);
    setLocale("en");
    expect(closedTitle("implemented")).toBe(`${en.STATUS_LABELS.closed} — ${en.RESOLUTION_LABELS.implemented}`);
    setLocale("ar");
  });

  it("falls back to the generic closed text without a resolution", () => {
    expect(closedTitle("")).toBeTruthy();
    expect(closedTitle(null)).not.toContain("undefined");
  });
});
