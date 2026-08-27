"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Info, Plus, Trash2 } from "lucide-react";

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
    <span className="ms-2 inline-flex rounded-full bg-danger/10 px-2 py-0.5 font-heading text-[10px] font-bold text-danger-dark border border-danger/15 uppercase tracking-wider">
      {T.reminders.escalationTag}
    </span>
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
    <fieldset className="min-w-[260px] flex-1">
      <legend className="mb-2 font-heading text-[12px] font-bold uppercase tracking-wider text-muted">{T.reminders.direction}</legend>
      <div role="radiogroup" className="flex rounded-xl border border-line bg-subtle/55 p-1">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={`flex-1 rounded-lg px-2.5 py-1.5 font-heading text-[12px] font-bold transition-all
                ${selected ? "bg-navy text-white shadow-sm" : "text-ink-soft hover:text-ink hover:bg-subtle"}`}
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
    <Card title={T.nav.reminders} className="rounded-2xl border border-line bg-surface shadow-sm">
      <p className="text-sm font-bold text-navy">{T.reminders.managedHelp}</p>
      <p className="mt-2 text-sm leading-relaxed font-medium text-ink-soft">{T.reminders.managedBody}</p>
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
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <Card title={T.reminders.rulesTitle} className="rounded-2xl border border-line bg-surface shadow-sm">
        <p className="mb-5 text-sm font-medium leading-relaxed text-ink-soft">{T.reminders.rulesHelp}</p>

        {list.length === 0 ? (
          <p className="text-sm font-bold text-ink-soft bg-subtle/50 rounded-xl p-6 text-center border border-dashed border-line">
            {T.reminders.noRules}
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {list.map((rule) => {
              const switchLabel = `${rule.enabled ? T.reminders.enabled : T.reminders.disabled} — ${T.reminders.toggleRule}`;
              return (
                <li key={rule.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <ToggleSwitch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule.mutate(rule)}
                    label={switchLabel}
                    hideLabel
                    disabled={toggleRule.isPending}
                  />
                  <div className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
                    <span>{whenPhrase(rule.offset_days)}</span>
                    <span className="text-ink-soft font-medium">{T.common.listSep}{T.reminders.notify} </span>
                    <span className="font-bold text-navy">
                      {RECIPIENT_ROLE_LABELS[rule.recipient_role]}
                    </span>
                    {rule.recipient_role === "audit" ? <EscalationTag /> : null}
                    {rule.label ? <span className="text-ink-soft font-medium"> — {rule.label}</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteRule.mutate(rule)}
                    disabled={deleteRule.isPending}
                    aria-label={T.reminders.deleteRule}
                    className="flex size-8 items-center justify-center rounded-lg border border-danger/15 bg-surface text-danger-dark transition-colors hover:bg-danger/10 disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Rule creation form */}
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
          className="mt-6 border-t border-line/65 pt-6 space-y-4"
        >
          <div className="flex flex-wrap items-end gap-4">
            <DirectionToggle value={direction} onChange={setDirection} />
            {direction === "on" ? null : (
              <Field label={T.reminders.dayCount} className="w-28">
                <TextInput
                  type="number"
                  min={1}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  dir="ltr"
                  required
                />
              </Field>
            )}
            <Field label={T.reminders.recipient} className="min-w-[200px]">
              <Select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                {Object.entries(RECIPIENT_ROLE_LABELS).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={T.reminders.labelOptional} className="flex-1 min-w-[200px]">
              <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Button type="submit" disabled={createRule.isPending} className="gap-1.5 font-bold shadow-sm h-[40px] px-4">
              <Plus className="size-4" />
              {T.common.add}
            </Button>
          </div>

          {draftOffset !== null ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-primary/10 bg-primary/5 p-4 text-[13px] font-medium text-primary-dark">
              <Info className="size-4 shrink-0 mt-0.5" aria-hidden />
              <div>
                <span>{whenPhrase(draftOffset)}</span>
                <span>{T.common.listSep}{T.reminders.notify} {RECIPIENT_ROLE_LABELS[recipient]}</span>
                {recipient === "audit" ? ` — ${T.reminders.escalationTag}` : ""}
                {label ? ` — ${label}` : ""}
              </div>
            </div>
          ) : null}
        </form>
      </Card>

      {/* Action plan requirement policy */}
      <Card title={T.reminders.policyTitle} className="rounded-2xl border border-line bg-surface shadow-sm">
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
