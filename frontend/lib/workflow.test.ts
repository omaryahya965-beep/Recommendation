import { describe, expect, it } from "vitest";

import {
  availableActions,
  can,
  isWaitingOn,
  stageForStatus,
  stageIndexForStatus,
  workflowSnapshot,
} from "./workflow";

describe("workflow view-model", () => {
  it("maps backend statuses onto the nine presentation stages", () => {
    expect(stageIndexForStatus("draft")).toBe(0);
    expect(stageIndexForStatus("in_progress")).toBe(5);
    expect(stageIndexForStatus("pending_head_review")).toBe(6);
    expect(stageIndexForStatus("closed")).toBe(8);
    expect(stageForStatus("submitted_for_verification").id).toBe("verify");
  });

  it("allows a role to act only when the status matches the real backend guard", () => {
    expect(can("respond", "pending_response", "department_head")).toBe(true);
    expect(can("verify", "submitted_for_verification", "audit")).toBe(true);
    expect(can("council_closure", "pending_closure_council", "council")).toBe(true);
  });

  it("denies actions for the wrong role or the wrong status", () => {
    expect(can("respond", "pending_response", "employee")).toBe(false);
    expect(can("verify", "in_progress", "audit")).toBe(false);
    expect(can("mark_implemented", "pending_head_review", "employee")).toBe(false);
  });

  it("marks every stage completed when the recommendation is closed", () => {
    const snap = workflowSnapshot("closed");
    expect(snap.every((stage) => stage.state === "completed")).toBe(true);
  });

  it("flags returned statuses on the current stage instead of treating them as progress", () => {
    const snap = workflowSnapshot("returned_insufficient");
    const current = snap.find((stage) => stage.id === "execution");
    expect(current?.state).toBe("returned");
    expect(snap.find((stage) => stage.id === "finding")?.state).toBe("completed");
    expect(snap.find((stage) => stage.id === "closure")?.state).toBe("next");
  });

  it("reports whether the case is waiting on a role, ignoring audit-only recurrence confirm", () => {
    expect(isWaitingOn("in_progress", "employee")).toBe(true);
    expect(isWaitingOn("pending_response", "employee")).toBe(false);
    expect(availableActions("draft", "audit")).toEqual(["confirm_recurrence"]);
    expect(isWaitingOn("draft", "audit")).toBe(false);
  });
});
