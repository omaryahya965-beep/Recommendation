"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

import { Button, ErrorBanner, Field, Select, TextArea } from "@/components/ui/Base";
import { FilePicker } from "@/components/ui/FilePicker";
import { errorMessage } from "@/lib/api";
import { sortSteps } from "@/lib/case";
import { cn } from "@/lib/cn";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { prepareFileSubmission } from "@/lib/upload";

/**
 * Attach one evidence file to the case (optionally to one plan step). Uses
 * the signed direct upload when storage is configured; the API records the
 * file either way. Shared by the desktop desk and the mobile upload sheet.
 */
export function EvidenceUploadForm({
  rec,
  action,
  defaultStep,
  onUploaded,
  showActionError = true,
  className,
}: {
  rec: RecommendationDetail;
  action: WorkflowAction;
  /** Pre-select a step (e.g. when opened from that step). */
  defaultStep?: number | null;
  onUploaded?: () => void;
  /** Off where the surrounding desk already shows the action's error once. */
  showActionError?: boolean;
  className?: string;
}) {
  useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(defaultStep ? String(defaultStep) : "");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const steps = sortSteps(rec.action_plan?.steps ?? []);
  const busy = uploading || action.mutation.isPending;

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setLocalError(T.common.required);
      return;
    }
    setLocalError(null);
    setUploading(true);
    try {
      const payload = await prepareFileSubmission({
        file,
        purpose: "evidence",
        fileFieldName: "file",
        extraFields: {
          ...(step ? { step } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      action.mutation.mutate(
        { path: "evidence/", ...payload },
        {
          onSuccess: () => {
            setFile(null);
            setNotes("");
            setStep(defaultStep ? String(defaultStep) : "");
            onUploaded?.();
          },
          onSettled: () => setUploading(false),
        }
      );
    } catch (err) {
      setUploading(false);
      setLocalError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={upload} className={cn("space-y-4", className)} aria-busy={busy}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FilePicker
          label={T.evidenceRegister.file}
          file={file}
          onChange={setFile}
          hint={`${T.evidenceRegister.allowedTypes} · ${T.evidenceRegister.maxSize}`}
        />
        {steps.length ? (
          <Field label={T.evidenceRegister.linkStep}>
            <Select value={step} onChange={(event) => setStep(event.target.value)}>
              <option value="">{T.evidenceRegister.noStep}</option>
              {steps.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {String(index + 1).padStart(2, "0")} {item.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label={T.evidenceRegister.description}>
        <TextArea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={T.evidenceRegister.descriptionHint}
        />
      </Field>
      <ErrorBanner message={localError ?? (showActionError ? action.error : null)} />
      <Button type="submit" disabled={busy || !file} className="min-h-12 w-full md:w-auto">
        <Upload className="size-4" aria-hidden />
        {busy ? T.common.uploading : T.evidenceRegister.upload}
      </Button>
    </form>
  );
}
