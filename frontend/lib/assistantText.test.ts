import { describe, expect, it } from "vitest";

import { normalizeRefs, parseAssistantText } from "./assistantText";

describe("assistant text (BUG-27)", () => {
  it("writes references the way the rest of the app does", () => {
    expect(normalizeRefs("Recommendation REC-16 and rec 7, report RPT-5; REC-12345 stays")).toBe(
      "Recommendation REC-0016 and REC-0007, report RPT-0005; REC-12345 stays"
    );
    expect(normalizeRefs("PREC-16 is not a reference")).toBe("PREC-16 is not a reference");
  });

  it("turns bold, lists and headings into structure, not literal symbols", () => {
    const blocks = parseAssistantText("## الملخص\n**العنوان**: نص\n\n1. **Recommendation REC-16** late\n2. second\n- a\n- `b`");
    expect(blocks).toEqual([
      { type: "heading", content: [{ type: "text", text: "الملخص" }] },
      { type: "paragraph", lines: [[{ type: "strong", text: "العنوان" }, { type: "text", text: ": نص" }]] },
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "strong", text: "Recommendation REC-0016" }, { type: "text", text: " late" }],
          [{ type: "text", text: "second" }],
        ],
      },
      { type: "list", ordered: false, items: [[{ type: "text", text: "a" }], [{ type: "code", text: "b" }]] },
    ]);
  });

  it("keeps markup-looking text as plain text", () => {
    const blocks = parseAssistantText("<img src=x onerror=alert(1)> **unclosed");
    expect(blocks).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: "<img src=x onerror=alert(1)> **unclosed" }]] },
    ]);
  });
});
