import { describe, expect, it } from "vitest";

import { detailText, metaValueText } from "./AuditTrail";

describe("trail summary line", () => {
  it("translates decisions and hides internal values", () => {
    expect(detailText({ decision: "agree", previous_response: null })).toBe("موافقة");
  });

  it("shows a file by its own name, never its storage path or id", () => {
    expect(detailText({ evidence_id: 3, file_name: "evidence/2026/10/proof.pdf", step_id: null })).toBe("proof.pdf");
  });

  it("formats the plan's date and keeps notes", () => {
    const line = detailText({ responsible_employee: "موظف مالية", target_date: "2026-11-09", previous_plan: null, notes: "خطة" });
    expect(line).toContain("موظف مالية");
    expect(line).not.toContain("2026-11-09");
    expect(line).toContain("خطة");
  });

  it("has nothing to say for a bare transition", () => {
    expect(detailText({ from_status: "draft", to_status: "pending_response" })).toBeNull();
  });
});

describe("progress history (external QA: [object Object])", () => {
  it("summarises a step progress change as percentages", () => {
    expect(
      detailText({
        step_title: "Reconcile accounts",
        previous: { is_done: false, comments: "", progress_percent: 0 },
        current: { is_done: true, progress_percent: 100 },
      })
    ).toBe("Reconcile accounts — 0% → 100%");
  });

  it("writes nested values readably in the details view", () => {
    expect(metaValueText({ is_done: true, progress_percent: 100 })).toBe("is_done: true, progress_percent: 100");
    expect(metaValueText({ text: { to: "new", from: "old" } })).toBe("text: from: old, to: new");
    expect(metaValueText(["a", 2])).toBe("a, 2");
    expect(metaValueText(null)).toBe("—");
    expect(metaValueText("plain")).toBe("plain");
    expect(metaValueText({ a: { b: 1 } })).not.toContain("[object Object]");
  });
});
