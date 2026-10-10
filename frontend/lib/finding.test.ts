import { describe, expect, it } from "vitest";

import { caseTitle, composeFinding, EMPTY_FINDING, findingDraftFromText, parseFinding } from "./finding";

describe("finding text round-trip", () => {
  it("restores every wizard field from composed text", () => {
    const draft = {
      ...EMPTY_FINDING,
      title: "ضبط السلف",
      condition: "لا توجد سياسة مكتوبة.",
      statement: "اعتماد سياسة.",
      evidence: "نسخة معتمدة.",
    };
    expect(findingDraftFromText(composeFinding(draft))).toEqual(draft);
  });

  it("puts legacy free text into the condition", () => {
    const draft = findingDraftFromText("نص قديم بلا عناوين");
    expect(draft.condition).toBe("نص قديم بلا عناوين");
    expect(composeFinding(draft)).toContain("نص قديم بلا عناوين");
  });

  it("keeps a preamble without losing an existing condition", () => {
    const draft = findingDraftFromText("مقدمة\nالوضع القائم:\nوصف الوضع");
    expect(draft.condition).toBe("وصف الوضع");
    expect(draft.notes).toBe("مقدمة");
  });

  it("titles a case from its title section, falling back to the condition", () => {
    expect(caseTitle("العنوان:\nعنوان واضح\nالوضع القائم:\nوصف")).toBe("عنوان واضح");
    expect(caseTitle("الوضع القائم:\nوصف فقط")).toBe("وصف فقط");
    expect(parseFinding("").structured).toBe(false);
  });
});
