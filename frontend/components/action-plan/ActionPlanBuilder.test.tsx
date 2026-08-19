import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { T } from "@/lib/i18n";

import {
  ActionPlanBuilder,
  emptyPlanDraft,
  toPlanPayload,
  type PlanDraft,
  type PlanStepDraft,
} from "./ActionPlanBuilder";

vi.mock("@/lib/hooks", () => ({
  useEmployees: () => ({
    data: [
      {
        id: 7,
        username: "emp1",
        full_name_ar: "موظف تجريبي",
        role: "employee",
        department: 1,
        municipality: 1,
      },
    ],
  }),
}));

function step(partial: Partial<PlanStepDraft> = {}): PlanStepDraft {
  return {
    key: partial.key ?? "step-1",
    title: partial.title ?? "",
    description: partial.description ?? "",
    result: partial.result ?? "",
    evidence: partial.evidence ?? "",
    dependsOnIndex: partial.dependsOnIndex ?? null,
  };
}

function draft(partial: Partial<PlanDraft> = {}): PlanDraft {
  return {
    responsible_employee: 7,
    target_date: "2026-09-01",
    notes: "",
    steps: [step({ title: "إغلاق الفجوة" })],
    ...partial,
  };
}

function renderBuilder(initial: PlanDraft) {
  const onSubmit = vi.fn();
  const view = render(
    <ActionPlanBuilder draft={initial} onChange={vi.fn()} onSubmit={onSubmit} />
  );
  return { ...view, onSubmit };
}

function submitForm(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) throw new Error("expected a form");
  fireEvent.submit(form);
}

describe("toPlanPayload", () => {
  it("returns null when the owner or target date is missing", () => {
    expect(toPlanPayload(draft({ responsible_employee: null }))).toBeNull();
    expect(toPlanPayload(draft({ target_date: "" }))).toBeNull();
  });

  it("drops untitled steps and returns a payload when at least one titled step remains", () => {
    const payload = toPlanPayload(
      draft({
        notes: "  ملاحظة  ",
        steps: [step({ key: "a", title: "مرحلة 1" }), step({ key: "b", title: "   " })],
      })
    );
    expect(payload).toMatchObject({
      responsible_employee: 7,
      target_date: "2026-09-01",
      notes: "ملاحظة",
      steps: [{ title: "مرحلة 1", order: 0, depends_on_index: null }],
    });
  });
});

describe("ActionPlanBuilder submit validation", () => {
  it("shows the required message when owner or date is missing", () => {
    const { container, onSubmit } = renderBuilder(emptyPlanDraft());
    submitForm(container);
    expect(screen.getByRole("alert")).toHaveTextContent(T.common.required);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires at least one titled step", () => {
    const { container, onSubmit } = renderBuilder(
      draft({ steps: [step({ title: "   " })] })
    );
    submitForm(container);
    expect(screen.getByRole("alert")).toHaveTextContent(T.plan.minSteps);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a mix of titled and blank steps instead of silently dropping blanks", () => {
    const { container, onSubmit } = renderBuilder(
      draft({
        steps: [step({ key: "a", title: "مرحلة 1" }), step({ key: "b", title: "" })],
      })
    );
    submitForm(container);
    expect(screen.getByRole("alert")).toHaveTextContent(T.plan.titleRequired);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a payload when the draft is complete", () => {
    const initial = draft({
      notes: "ملاحظة",
      steps: [
        step({
          title: "إغلاق الفجوة",
          description: "وصف",
          result: "نتيجة",
          evidence: "دليل",
        }),
      ],
    });
    const { container, onSubmit } = renderBuilder(initial);
    submitForm(container);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(toPlanPayload(initial));
  });
});
