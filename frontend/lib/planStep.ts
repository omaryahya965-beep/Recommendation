/**
 * ActionStep.comments is the only free-text field per step. The builder writes
 * labelled sections into it so the timeline can show expected result and
 * required evidence without inventing backend columns.
 */

export type StepSectionId = "description" | "result" | "evidence";

export interface StepDraft {
  description: string;
  result: string;
  evidence: string;
}

export const EMPTY_STEP: StepDraft = { description: "", result: "", evidence: "" };

const SECTIONS: Array<{ id: StepSectionId; heading: string }> = [
  { id: "description", heading: "الوصف" },
  { id: "result", heading: "المخرج المتوقع" },
  { id: "evidence", heading: "الدليل المطلوب" },
];

const HEADING_LOOKUP = new Map(SECTIONS.map((section) => [section.heading, section.id]));

export function composeStep(draft: StepDraft): string {
  return SECTIONS.filter((section) => draft[section.id]?.trim())
    .map((section) => `${section.heading}:\n${draft[section.id].trim()}`)
    .join("\n\n");
}

export function parseStep(comments: string | null | undefined): StepDraft & { unstructured: string } {
  const value = (comments ?? "").trim();
  const draft: StepDraft = { ...EMPTY_STEP };
  if (!value) return { ...draft, unstructured: "" };

  const pattern = new RegExp(`^(${SECTIONS.map((s) => s.heading).join("|")}):\\s*$`, "u");
  const lines = value.split(/\r?\n/);
  let current: StepSectionId | null = null;
  const buffer: string[] = [];
  const preamble: string[] = [];

  const flush = () => {
    if (current) draft[current] = buffer.join("\n").trim();
    buffer.length = 0;
  };

  for (const line of lines) {
    const match = pattern.exec(line.trim());
    if (match) {
      flush();
      current = HEADING_LOOKUP.get(match[1]) ?? null;
      continue;
    }
    if (current) buffer.push(line);
    else preamble.push(line);
  }
  flush();

  return { ...draft, unstructured: preamble.join("\n").trim() };
}

export function stepHasStructure(comments: string | null | undefined) {
  const parsed = parseStep(comments);
  return Boolean(parsed.description || parsed.result || parsed.evidence);
}
