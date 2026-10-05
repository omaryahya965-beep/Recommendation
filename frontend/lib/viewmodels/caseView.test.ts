import { describe, expect, it } from "vitest";

import type { RecommendationDetail, TrailEntry } from "../types";
import {
  casePeople,
  defaultOpenSection,
  historyEntries,
  isExecutionDesk,
  keyDates,
  sectionFacts,
  sectionFromQuery,
  stageTimeline,
} from "./caseView";

let nextId = 1;
function move(to: string, at: string, action = "status_changed", from = "x"): TrailEntry {
  return {
    id: nextId++,
    action,
    user: "u",
    user_full_name: "مستخدم",
    user_role: "audit",
    metadata: { from_status: from, to_status: to },
    created_at: at,
  };
}

function user(id: number, name: string) {
  return { id, username: `u${id}`, full_name_ar: name, role: "employee" as const, department: 1, municipality: 1 };
}

function detail(overrides: Partial<RecommendationDetail> = {}): RecommendationDetail {
  return {
    id: 7,
    status: "in_progress",
    created_at: "2026-01-01T08:00:00Z",
    closed_at: null,
    trail: [],
    approvals: [],
    verifications: [],
    evidence_files: [],
    response: null,
    action_plan: null,
    workflow: null,
    ...overrides,
  } as unknown as RecommendationDetail;
}

describe("stage timeline", () => {
  const trail = [
    move("pending_response", "2026-01-05T08:00:00Z"),
    move("audit_review", "2026-01-10T08:00:00Z"),
    move("returned_for_revision", "2026-01-11T08:00:00Z"),
    move("audit_review", "2026-01-15T08:00:00Z"),
    move("pending_council", "2026-01-20T08:00:00Z"),
    move("action_plan_required", "2026-02-01T08:00:00Z"),
    move("action_plan_review", "2026-02-03T08:00:00Z"),
    move("in_progress", "2026-02-10T08:00:00Z"),
  ];

  it("marks earlier stages completed, the current one current, later ones next", () => {
    const stages = stageTimeline(detail({ status: "in_progress", trail }));
    expect(stages.map((stage) => stage.state)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "current",
      "next",
      "next",
      "next",
      "next",
    ]);
  });

  it("dates each stage by the first time the case entered it", () => {
    const stages = stageTimeline(detail({ status: "in_progress", trail }));
    expect(stages[0].enteredAt).toBe("2026-01-01T08:00:00Z"); // preparation = creation
    expect(stages[1].enteredAt).toBe("2026-01-05T08:00:00Z"); // response
    expect(stages[2].enteredAt).toBe("2026-01-10T08:00:00Z"); // audit review (first entry)
    expect(stages[6].enteredAt).toBeNull();
  });

  it("counts returns into a stage and flags a returned current stage", () => {
    const stages = stageTimeline(detail({ status: "returned_for_revision", trail: trail.slice(0, 3) }));
    const response = stages.find((stage) => stage.id === "response")!;
    expect(response.returns).toBe(1);
    expect(response.state).toBe("returned");
  });

  it("completes every stage once closed", () => {
    const stages = stageTimeline(detail({ status: "closed", trail }));
    expect(stages.every((stage) => stage.state === "completed")).toBe(true);
  });
});

describe("key dates and people", () => {
  it("reads milestones from the trail and the binding deadline from the server", () => {
    const rec = detail({
      trail: [move("pending_response", "2026-01-05T08:00:00Z"), move("action_plan_approved", "2026-02-12T08:00:00Z")],
      approvals: [
        { id: 1, approval_type: "council_ratification", approved_by_detail: user(9, "رئيس المجلس"), notes: "", created_at: "2026-01-25T08:00:00Z" },
      ],
      action_plan: { target_date: "2026-03-01", responsible_employee_detail: user(3, "سارة"), steps: [] } as never,
      workflow: { deadline: { date: "2026-03-20", source: "verification" } } as never,
    });
    const dates = keyDates(rec);
    expect(dates.issued).toBe("2026-01-05T08:00:00Z");
    expect(dates.ratified).toBe("2026-01-25T08:00:00Z");
    expect(dates.planApproved).toBe("2026-02-12T08:00:00Z");
    expect(dates.planTarget).toBe("2026-03-01");
    expect(dates.bindingDeadline).toBe("2026-03-20");
  });

  it("names the latest verifier (the API lists decisions oldest first)", () => {
    const rec = detail({
      verifications: [
        { id: 1, decision: "partial", reviewed_by_detail: user(4, "الأول"), created_at: "2026-03-01T00:00:00Z" },
        { id: 2, decision: "sufficient", reviewed_by_detail: user(5, "الأخير"), created_at: "2026-03-09T00:00:00Z" },
      ] as never,
    });
    expect(casePeople(rec).find((person) => person.part === "verifier")?.name).toBe("الأخير");
  });
});

describe("sections", () => {
  const workflow = (primary: string | null) => ({ workflow: { primary_action: primary, available_actions: [] } as never });

  it("opens the record that complements the action panel", () => {
    expect(defaultOpenSection(detail({ status: "audit_review", ...workflow("review_response") }))).toBe("response");
    expect(defaultOpenSection(detail({ status: "submitted_for_verification", ...workflow("verify") }))).toBe("evidence");
    expect(defaultOpenSection(detail({ status: "in_progress", ...workflow("update_progress") }))).toBe("evidence");
    expect(defaultOpenSection(detail({ status: "partial", ...workflow("upload_evidence") }))).toBe("verification");
    expect(defaultOpenSection(detail({ status: "pending_closure_council", ...workflow("council_closure") }))).toBe("evidence");
  });

  it("falls back to where the case is when there is nothing to do", () => {
    expect(defaultOpenSection(detail({ status: "pending_council", ...workflow(null) }))).toBe("response");
    expect(defaultOpenSection(detail({ status: "in_progress", ...workflow(null) }))).toBe("plan");
    expect(defaultOpenSection(detail({ status: "closed", ...workflow(null) }))).toBe("decisions");
  });

  it("treats progress, upload and submit as one execution desk", () => {
    expect(isExecutionDesk("update_progress")).toBe(true);
    expect(isExecutionDesk("mark_implemented")).toBe(true);
    expect(isExecutionDesk("verify")).toBe(false);
    expect(isExecutionDesk(null)).toBe(false);
  });

  it("understands section links and the old tab names", () => {
    expect(sectionFromQuery("evidence")).toBe("evidence");
    expect(sectionFromQuery("approvals")).toBe("decisions");
    expect(sectionFromQuery("trail")).toBe("history");
    expect(sectionFromQuery("overview")).toBeNull();
    expect(sectionFromQuery(null)).toBeNull();
  });

  it("summarises plan progress and the latest verification", () => {
    const facts = sectionFacts(
      detail({
        action_plan: {
          steps: [
            { id: 1, is_done: true, progress_percent: 100 },
            { id: 2, is_done: false, progress_percent: 50 },
          ],
        } as never,
        verifications: [
          { id: 1, decision: "insufficient" },
          { id: 2, decision: "partial" },
        ] as never,
      })
    );
    expect(facts.stepsDone).toBe(1);
    expect(facts.stepsTotal).toBe(2);
    expect(facts.progress).toBe(75);
    expect(facts.latestVerification).toBe("partial");
  });
});

describe("history", () => {
  const trail = [
    move("audit_review", "2026-01-10T08:00:00Z"),
    { ...move("x", "2026-01-11T08:00:00Z", "evidence_uploaded"), metadata: {} },
    { ...move("x", "2026-01-12T08:00:00Z", "comment"), metadata: {} },
  ];

  it("filters status changes and file events, newest first", () => {
    expect(historyEntries(trail, "decisions").map((entry) => entry.action)).toEqual(["status_changed"]);
    expect(historyEntries(trail, "files").map((entry) => entry.action)).toEqual(["evidence_uploaded"]);
    expect(historyEntries(trail, "all").map((entry) => entry.action)).toEqual([
      "comment",
      "evidence_uploaded",
      "status_changed",
    ]);
  });
});
