"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, ErrorBanner, Field, Select, TextInput, ToggleSwitch } from "@/components/ui/Base";
import { CardSkeleton } from "@/components/ui/EmptyState";
import { api, errorMessage } from "@/lib/api";
import { RECIPIENT_ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Paginated, ReminderRule, Role, WorkflowPolicy } from "@/lib/types";

type Direction = "before" | "on" | "after";

function dayUnit(n: number) {
  if (n === 1) return T.reminders.day;
  if (n === 2) return T.reminders.twoDays;
  if (n <= 10) return T.reminders.days;
  return T.reminders.daysAccusative;
}

function formatDayCount(n: number) {
  if (n === 1) return T.reminders.dayOne;
  if (n === 2) return T.reminders.twoDays;
  return `${n} ${dayUnit(n)}`;
}

function whenPhrase(offset: number) {
  if (offset === 0) return T.reminders.onDueDate;
  const count = formatDayCount(Math.abs(offset));
  if (offset < 0) return T.reminders.beforeBy.replace("{n}", count);
  return T.reminders.afterBy.replace("{n}", count);
}

function offsetFromForm(direction: Direction, days: string): number | null {
  if (direction === "on") return 0;
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1) return null;
  return direction === "before" ? -n : n;
}

function EscalationTag() {
  useI18n();
  return (
    <span className="ms-2 inline-block rounded-full bg-slate-tint px-2 py-0.5 font-heading text-[11px] font-medium text-slate-dark">
      {T.reminders.escalationTag}
    </span>
  );
}

function TrashIcon() {
  useI18n();
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h9M6 4.5V3.25A.75.75 0 0 1 6.75 2.5h2.5a.75.75 0 0 1 .75.75V4.5m-.5 0V13a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 4.5 13V4.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function DirectionToggle({ value, onChange }: { value: Direction; onChange: (next: Direction) => void }) {
  useI18n();
  const options: { id: Direction; label: string }[] = [
    { id: "before", label: T.reminders.beforeDeadline },
    { id: "on", label: T.reminders.onDueDate },
    { id: "after", label: T.reminders.afterDeadline },
  ];
  return (
    <fieldset className="min-w-64 flex-1">
      <legend className="mb-1 font-heading text-sm font-medium text-ink">{T.reminders.direction}</legend>
      <div role="radiogroup" className="flex rounded-(--radius-field) border hairline bg-surface p-0.5">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={`flex-1 rounded-[6px] px-2 py-2 font-heading text-xs font-medium transition-colors
                ${selected ? "bg-primary-dark text-white" : "text-ink hover:bg-subtle"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ReminderNotice() {
  useI18n();
  return (
    <Card title={T.nav.reminders}>
      <p className="text-sm font-medium text-ink">{T.reminders.managedHelp}</p>
      <p className="mt-2 text-sm text-ink-soft">{T.reminders.managedBody}</p>
    </Card>
  );
}

export function ReminderSettings({ role }: { role: Role }) {
  if (role !== "audit") return <ReminderNotice />;
  return <AuditReminderEditor />;
}

function AuditReminderEditor() {
  useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("before");
  const [days, setDays] = useState("7");
  const [recipient, setRecipient] = useState("employee");
  const [label, setLabel] = useState("");

  const { data: rules, isLoading } = useQuery({
    queryKey: ["reminder-rules"],
    queryFn: () => api<Paginated<ReminderRule>>("/api/reminder-rules/"),
  });
  const { data: policy } = useQuery({
    queryKey: ["workflow-policy"],
    queryFn: () => api<WorkflowPolicy>("/api/workflow-policy/"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["reminder-rules"] });
  const list = rules?.results ?? [];
  const draftOffset = offsetFromForm(direction, days);

  const createRule = useMutation({
    mutationFn: (offsetDays: number) =>
      api("/api/reminder-rules/", {
        method: "POST",
        body: { offset_days: offsetDays, recipient_role: recipient, label, enabled: true },
      }),
    onSuccess: () => {
      setError(null);
      setLabel("");
      invalidate();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const toggleRule = useMutation({
    mutationFn: (rule: ReminderRule) =>
      api(`/api/reminder-rules/${rule.id}/`, { method: "PATCH", body: { enabled: !rule.enabled } }),
    onSuccess: invalidate,
    onError: (err) => setError(errorMessage(err)),
  });

  const deleteRule = useMutation({
    mutationFn: (rule: ReminderRule) => api(`/api/reminder-rules/${rule.id}/`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(errorMessage(err)),
  });

  const updatePolicy = useMutation({
    mutationFn: (body: Partial<WorkflowPolicy>) =>
      api("/api/workflow-policy/", { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow-policy"] }),
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      <Card title={T.reminders.rulesTitle}>
        <p className="mb-4 text-sm text-ink-soft">{T.reminders.rulesHelp}</p>

        {list.length === 0 ? (
          <p className="text-sm text-ink-soft">{T.reminders.noRules}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {list.map((rule) => {
              const switchLabel = `${rule.enabled ? T.reminders.enabled : T.reminders.disabled} — ${T.reminders.toggleRule}`;
              return (
                <li key={rule.id} className="flex items-center gap-3 py-3">
                  <ToggleSwitch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule.mutate(rule)}
                    label={switchLabel}
                    hideLabel
                    disabled={toggleRule.isPending}
                  />
                  <p className="min-w-0 flex-1 text-sm">
                    <span>{whenPhrase(rule.offset_days)}</span>
                    <span className="text-ink-soft">{T.common.listSep}{T.reminders.notify} </span>
                    <span className="font-heading font-medium">
                      {RECIPIENT_ROLE_LABELS[rule.recipient_role]}
                    </span>
                    {rule.recipient_role === "audit" ? <EscalationTag /> : null}
                    {rule.label ? <span className="text-ink-soft"> — {rule.label}</span> : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => deleteRule.mutate(rule)}
                    disabled={deleteRule.isPending}
                    aria-label={T.reminders.deleteRule}
                    className="rounded-(--radius-field) p-1.5 text-seal-dark hover:bg-seal-tint disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const offsetDays = draftOffset;
            if (offsetDays === null) {
              setError(T.reminders.invalidDays);
              return;
            }
            createRule.mutate(offsetDays);
          }}
          className="mt-4 flex flex-wrap items-end gap-3 border-t hairline pt-4"
        >
          <DirectionToggle value={direction} onChange={setDirection} />
          {direction === "on" ? null : (
            <Field label={T.reminders.dayCount}>
              <TextInput
                type="number"
                min={1}
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-28"
                dir="ltr"
                required
              />
            </Field>
          )}
          <Field label={T.reminders.recipient}>
            <Select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              {Object.entries(RECIPIENT_ROLE_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={T.reminders.labelOptional}>
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button type="submit" disabled={createRule.isPending}>
            + {T.common.add}
          </Button>
          {draftOffset !== null ? (
            <p className="basis-full text-sm text-ink-soft">
              {whenPhrase(draftOffset)}{T.common.listSep}{T.reminders.notify} {RECIPIENT_ROLE_LABELS[recipient]}
              {recipient === "audit" ? ` — ${T.reminders.escalationTag}` : ""}
              {label ? ` — ${label}` : ""}
            </p>
          ) : null}
        </form>
      </Card>

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-ink/15" />
      </div>

      <Card title={T.reminders.policyTitle}>
        <ToggleSwitch
          checked={policy?.require_plan_with_response ?? false}
          onCheckedChange={(next) => updatePolicy.mutate({ require_plan_with_response: next })}
          label={T.reminders.requirePlan}
          description={T.reminders.requirePlanHelp}
          disabled={!policy || updatePolicy.isPending}
        />
      </Card>
    </div>
  );
}
