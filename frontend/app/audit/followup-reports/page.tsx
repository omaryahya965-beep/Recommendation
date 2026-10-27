"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Save, Sparkles } from "lucide-react";
import { useState } from "react";

import { FollowUpList, FollowUpSessionCard } from "@/components/followup/FollowUpArchive";
import { Button, Callout, Card, ErrorBanner, Field, TextInput } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, errorMessage } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import { localISODate } from "@/lib/format";
import { isoDateFromToday } from "@/lib/limits";
import type { FollowUpPreview } from "@/lib/types";
import { useGuardedMutation } from "@/lib/useGuardedMutation";

export default function AuditFollowUpsPage() {
  useI18n();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FollowUpPreview | null>(null);

  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  // "generate" used to only compute a preview. The API now separates the two:
  // /preview/ computes without saving, /generate/ stores a frozen report.
  const generate = useGuardedMutation({
    mutationFn: () =>
      api<FollowUpPreview>("/api/followup-reports/preview/", {
        method: "POST",
        body: { period_start: start, period_end: end, language: "ar" },
      }),
    onSuccess: (data) => {
      setError(null);
      setSaved(false);
      setPreview(data);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Saves the period that was previewed, even if the date fields were
  // edited afterwards (external QA).
  const save = useGuardedMutation({
    mutationFn: () =>
      api("/api/followup-reports/generate/", {
        method: "POST",
        body: { period_start: preview?.period_start, period_end: preview?.period_end, language: "ar" },
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Quick periods: the ones auditors ask for most.
  const presets: Array<{ label: string; range: () => [string, string] }> = [
    { label: T.followup.presetLast30, range: () => [isoDateFromToday(-30), isoDateFromToday(0)] },
    {
      label: T.followup.presetQuarter,
      range: () => {
        const now = new Date();
        const first = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        return [localISODate(first), isoDateFromToday(0)];
      },
    },
    { label: T.followup.presetYear, range: () => [`${new Date().getFullYear()}-01-01`, isoDateFromToday(0)] },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title={T.followup.title} description={T.followup.subtitle} />

      {/* The form and the notice are for the screen; paper carries the report. */}
      <div data-print="hide" className="space-y-3">
        <Card title={T.followup.generate}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              generate.mutate();
            }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={T.followup.presetsLabel}>
              <span className="text-[13px] text-ink-soft">{T.followup.presetsLabel}:</span>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const [from, to] = preset.range();
                    setStart(from);
                    setEnd(to);
                  }}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-soft transition-colors hover:border-primary/40 hover:text-primary-dark"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={T.followup.from}>
                <TextInput type="date" dir="ltr" value={start} onChange={(event) => setStart(event.target.value)} required />
              </Field>
              <Field label={T.followup.to}>
                <TextInput type="date" dir="ltr" value={end} onChange={(event) => setEnd(event.target.value)} required />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={generate.isPending}>
                  <Sparkles className="size-4" />
                  {T.followup.generateAction}
                </Button>
                <Button type="button" variant="secondary" onClick={() => save.mutate()} disabled={save.isPending || !preview || saved}>
                  <Save className="size-4" />
                  {T.followup.saveAction}
                </Button>
              </div>
            </div>
          </form>
          <ErrorBanner message={error} />
        </Card>

        {preview ? (
          <Callout tone={saved ? "success" : "neutral"}>{saved ? T.followup.savedNotice : T.followup.previewNotice}</Callout>
        ) : (
          <p className="px-1 text-[13px] text-ink-soft">{T.followup.howTo}</p>
        )}
      </div>

      {preview ? <FollowUpSessionCard preview={preview} saved={saved} /> : null}

      <section className="space-y-3 pt-2" data-print={preview ? "hide" : undefined}>
        <h2 className="text-[16px] font-semibold text-navy">{T.followup.archive}</h2>
        <FollowUpList />
      </section>
    </div>
  );
}
