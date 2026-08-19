/**
 * The backend stores a recommendation as free text (`Recommendation.text`) plus
 * a separate `root_cause` field — there are no per-section columns.
 *
 * To keep audit working-paper structure without inventing backend fields, the
 * composer writes labelled sections into that single text field and the
 * workspace parses them back out. Text authored elsewhere (or by older records)
 * simply has no sections and renders as plain prose.
 */

import { currentT } from "./i18n/messages";

export type FindingSectionId =
  | "title"
  | "condition"
  | "criteria"
  | "effect"
  | "statement"
  | "objective"
  | "required_action"
  | "outcome"
  | "success"
  | "evidence"
  | "notes";

export interface FindingSectionDef {
  id: FindingSectionId;
  /** Heading written into `text`. Changing this breaks parsing of old records. */
  heading: string;
  label: string;
  hint: string;
  required: boolean;
  rows: number;
}

export const FINDING_SECTIONS: FindingSectionDef[] = [
  {
    id: "title",
    heading: "العنوان",
    label: "عنوان الملاحظة",
    hint: "جملة واحدة تصف جوهر الملاحظة، تظهر في السجل ورأس الملف.",
    required: false,
    rows: 1,
  },
  {
    id: "condition",
    heading: "الوضع القائم",
    label: "الوضع القائم — ما الذي وُجد؟",
    hint: "صف الواقع الذي لوحظ أثناء التدقيق بدقة وبلا أحكام.",
    required: true,
    rows: 4,
  },
  {
    id: "criteria",
    heading: "المعيار",
    label: "المعيار — ما الذي كان يجب أن يحدث؟",
    hint: "النظام أو التعليمات أو الإجراء المعتمد الذي تمت المقارنة به.",
    required: false,
    rows: 3,
  },
  {
    id: "effect",
    heading: "الأثر",
    label: "الأثر — ما النتيجة المترتبة؟",
    hint: "الأثر المالي أو التشغيلي أو الرقابي أو السمعي المترتب على الوضع القائم.",
    required: false,
    rows: 3,
  },
  {
    id: "statement",
    heading: "التوصية",
    label: "نص التوصية",
    hint: "صياغة واضحة وقابلة للتنفيذ والقياس تحدد ما يجب أن تفعله الدائرة.",
    required: true,
    rows: 4,
  },
  {
    id: "objective",
    heading: "الهدف",
    label: "الهدف من التوصية",
    hint: "ما الذي يجب أن يتحقق لدى الإدارة بعد التنفيذ؟",
    required: false,
    rows: 3,
  },
  {
    id: "required_action",
    heading: "الإجراء المطلوب",
    label: "الإجراء المطلوب من الإدارة",
    hint: "ما الذي يُطلب من الدائرة فعله، بصيغة قابلة للتنفيذ.",
    required: false,
    rows: 3,
  },
  {
    id: "outcome",
    heading: "النتيجة المتوقعة",
    label: "النتيجة التصحيحية المتوقعة",
    hint: "ما الذي سيتغيّر عند تنفيذ التوصية؟",
    required: false,
    rows: 3,
  },
  {
    id: "success",
    heading: "مؤشر النجاح",
    label: "مؤشر النجاح",
    hint: "كيف ستعرف الرقابة أن المعالجة تحققت؟",
    required: false,
    rows: 2,
  },
  {
    id: "evidence",
    heading: "الأدلة المتوقعة",
    label: "الأدلة المتوقعة لإثبات التنفيذ",
    hint: "يوجّه الدائرة إلى ما يجب رفعه لاحقاً كدليل على التنفيذ.",
    required: false,
    rows: 3,
  },
  {
    id: "notes",
    heading: "الملاحظات",
    label: "ملاحظات إضافية",
    hint: "أي سياق إضافي لا يندرج تحت الأقسام الأخرى.",
    required: false,
    rows: 3,
  },
];

/** Extra headings recognised when parsing older or free-typed text. */
const HEADING_ALIASES: Record<string, FindingSectionId> = {
  "الملاحظة": "condition",
  "المخاطر": "effect",
  Finding: "condition",
  Objective: "objective",
  Risks: "effect",
  Recommendation: "statement",
  "Success Indicator": "success",
};

export function sectionUi(id: FindingSectionId): { label: string; hint: string } {
  const T = currentT();
  const map: Record<FindingSectionId, { label: string; hint: string }> = {
    title: { label: T.create.findingTitle, hint: T.create.findingTitleHint },
    condition: { label: T.create.condition, hint: T.create.conditionHint },
    criteria: { label: T.create.criteria, hint: T.create.criteriaHint },
    effect: { label: T.create.effect, hint: T.create.effectHint },
    statement: { label: T.create.statement, hint: T.create.statementHint },
    objective: { label: T.create.objectiveLabel, hint: T.create.objectiveHint },
    required_action: { label: T.create.requiredActionLabel, hint: T.create.requiredActionHint },
    outcome: { label: T.create.expectedOutcome, hint: T.create.expectedOutcomeHint },
    success: { label: T.create.successIndicator, hint: T.create.successHint },
    evidence: { label: T.create.expectedEvidence, hint: T.create.expectedEvidenceHint },
    notes: { label: T.create.extraNotes, hint: T.create.extraNotesHint },
  };
  return map[id];
}

export function localizedFindingSections(): FindingSectionDef[] {
  return FINDING_SECTIONS.map((section) => ({ ...section, ...sectionUi(section.id) }));
}

export type FindingDraft = Record<FindingSectionId, string>;

export const EMPTY_FINDING: FindingDraft = {
  title: "",
  condition: "",
  criteria: "",
  effect: "",
  statement: "",
  objective: "",
  required_action: "",
  outcome: "",
  success: "",
  evidence: "",
  notes: "",
};

/** Builds the single `text` value stored on the recommendation. */
export function composeFinding(draft: FindingDraft): string {
  return FINDING_SECTIONS.filter((section) => draft[section.id]?.trim())
    .map((section) => `${section.heading}:\n${draft[section.id].trim()}`)
    .join("\n\n");
}

export interface ParsedFinding {
  /** Sections found in the stored text, in canonical order. */
  sections: Array<{ id: FindingSectionId; heading: string; label: string; body: string }>;
  /** Text that appeared before any recognised heading, or the whole value. */
  preamble: string;
  structured: boolean;
}

const HEADING_LOOKUP = new Map<string, FindingSectionDef>(
  FINDING_SECTIONS.map((section) => [section.heading, section])
);
for (const [alias, id] of Object.entries(HEADING_ALIASES)) {
  const def = FINDING_SECTIONS.find((section) => section.id === id);
  if (def) HEADING_LOOKUP.set(alias, def);
}

const HEADING_PATTERN = [...FINDING_SECTIONS.map((section) => section.heading), ...Object.keys(HEADING_ALIASES)]
  .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/** Splits stored text back into sections. Unstructured text returns as preamble. */
export function parseFinding(text: string): ParsedFinding {
  const value = (text ?? "").trim();
  if (!value) return { sections: [], preamble: "", structured: false };

  const pattern = new RegExp(`^(${HEADING_PATTERN}):\\s*$`, "u");
  const lines = value.split(/\r?\n/);

  const found: ParsedFinding["sections"] = [];
  const preamble: string[] = [];
  let currentId: FindingSectionId | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentId) {
      const def = FINDING_SECTIONS.find((section) => section.id === currentId)!;
      const body = buffer.join("\n").trim();
      if (body) found.push({ id: def.id, heading: def.heading, label: sectionUi(def.id).label, body });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = pattern.exec(line.trim());
    if (match) {
      flush();
      currentId = HEADING_LOOKUP.get(match[1])!.id;
      continue;
    }
    if (currentId) buffer.push(line);
    else preamble.push(line);
  }
  flush();

  return {
    sections: found,
    preamble: preamble.join("\n").trim(),
    structured: found.length > 0,
  };
}

/** Short one-line title for headers, tables and search results. */
export function caseTitle(text: string, max = 90): string {
  const parsed = parseFinding(text);
  const source =
    parsed.sections.find((section) => section.id === "title")?.body ||
    parsed.sections.find((section) => section.id === "condition")?.body ||
    parsed.preamble ||
    parsed.sections[0]?.body ||
    text ||
    "";
  const firstLine = source.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const clean = firstLine.trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}
