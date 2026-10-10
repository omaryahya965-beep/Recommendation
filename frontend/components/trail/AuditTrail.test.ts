import { describe, expect, it } from "vitest";

import { detailText } from "./AuditTrail";

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
