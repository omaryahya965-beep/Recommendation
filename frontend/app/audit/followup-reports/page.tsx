"use client";

import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";

import { FollowUpSessionCard } from "@/components/FollowUpList";
import { Button, Callout, Card, ErrorBanner, Field, TextInput } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, errorMessage } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import type { FollowUpPreview } from "@/lib/types";

export default function AuditFollowUpsPage() {
  useI18n();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FollowUpPreview | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api<FollowUpPreview>("/api/followup-reports/generate/", {
        method: "POST",
        body: { period_start: start, period_end: end, language: "ar" },
      }),
    onSuccess: (data) => {
      setError(null);
      setPreview(data);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.followup.title} description={T.followup.subtitle} />

      <Card title={T.followup.generate}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            generate.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Field label={T.followup.from}>
            <TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
          </Field>
          <Field label={T.followup.to}>
            <TextInput type="date" value={end} onChange={(event) => setEnd(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={generate.isPending}>
            <Sparkles className="size-4" />
            {T.followup.generateAction}
          </Button>
        </form>
        <ErrorBanner message={error} />
      </Card>

      <Callout tone="neutral" className="shadow-sm">
        {T.followup.sessionOnly}
      </Callout>

      {preview ? <FollowUpSessionCard preview={preview} /> : null}
    </div>
  );
}
