"use client";

import { Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export type ChecklistAnswer = "yes" | "no" | "na";
export type ChecklistState = Record<string, ChecklistAnswer>;

/**
 * The backend has no checklist model — verification is a single verdict plus
 * free text. This is a thinking aid, not a new record: the answers are composed
 * into the existing `notes` field so nothing is stored outside the API contract.
 */
export function checklistItems() {
  return [
    { id: "executed", label: T.checklist.executed },
    { id: "approved", label: T.checklist.approved },
    { id: "applied", label: T.checklist.applied },
    { id: "effect", label: T.checklist.effect },
    { id: "sufficient", label: T.checklist.sufficient },
    { id: "sustained", label: T.checklist.sustained },
  ] as const;
}

export const emptyChecklist = (): ChecklistState =>
  Object.fromEntries(checklistItems().map((item) => [item.id, "na" as ChecklistAnswer]));

function answerLabel(answer: ChecklistAnswer): string {
  if (answer === "yes") return T.checklist.yes;
  if (answer === "no") return T.checklist.no;
  return T.checklist.na;
}

/** Renders the checklist as text lines appended to the auditor's own notes. */
export function composeChecklistNotes(state: ChecklistState, notes: string): string {
  const items = checklistItems();
  const answered = items.filter((item) => state[item.id] !== "na");
  if (!answered.length) return notes;

  const lines = answered.map(
    (item) => `${state[item.id] === "yes" ? "☑" : "☐"} ${item.label} — ${answerLabel(state[item.id])}`
  );
  const block = [T.checklist.heading, ...lines].join("\n");
  return notes.trim() ? `${block}\n\n${notes.trim()}` : block;
}

const OPTIONS: Array<{ value: ChecklistAnswer; icon: typeof Check; active: string; label: string }> = [
  { value: "yes", icon: Check, active: "border-success bg-success/15 text-success-dark shadow-sm", label: "yes" },
  { value: "no", icon: X, active: "border-danger bg-danger/15 text-danger-dark shadow-sm", label: "no" },
  { value: "na", icon: Minus, active: "border-muted/40 bg-subtle text-ink-soft", label: "na" },
];

export function VerificationChecklist({
  state,
  onChange,
}: {
  state: ChecklistState;
  onChange: (next: ChecklistState) => void;
}) {
  useI18n();
  return (
    <fieldset className="rounded-2xl border border-line bg-subtle/30 p-5">
      <legend className="px-1.5 text-[13px] font-bold text-navy">{T.checklist.title}</legend>
      <p className="mb-4 text-[11.5px] font-medium leading-relaxed text-muted">{T.checklist.hint}</p>

      <ul className="divide-y divide-line/60">
        {checklistItems().map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={cn(
                "text-[13px] font-medium leading-snug",
                state[item.id] === "na" ? "text-ink-soft" : "font-semibold text-navy"
              )}
            >
              {item.label}
            </span>

            <div className="flex shrink-0 gap-1.5" role="group" aria-label={item.label}>
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = state[item.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    title={answerLabel(option.value)}
                    onClick={() => onChange({ ...state, [item.id]: option.value })}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border transition-all",
                      selected ? option.active : "border-line bg-surface text-muted hover:border-primary/40 hover:text-ink"
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="sr-only">{answerLabel(option.value)}</span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
