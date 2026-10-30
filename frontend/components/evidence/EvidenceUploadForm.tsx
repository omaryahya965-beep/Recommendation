"use client";

import { Camera, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button, ErrorBanner, Field, Select, TextArea } from "@/components/ui/Base";
import { FilePicker } from "@/components/ui/FilePicker";
import { errorMessage } from "@/lib/api";
import { sortSteps } from "@/lib/case";
import { cn } from "@/lib/cn";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { prepareFileSubmission } from "@/lib/upload";
import { NOTE_MAX } from "@/lib/limits";

/**
 * Attach one evidence file to the case (optionally to one plan step). Uses
 * the signed direct upload when storage is configured; the API records the
 * file either way. Shared by the desktop desk and the phone upload sheet.
 *
 * A failed upload keeps the chosen file and turns the button into "Try
 * again", so a dropped connection never means picking the file again.
 */
export function EvidenceUploadForm({
  rec,
  action,
  defaultStep,
  onUploaded,
  showActionError = true,
  allowCamera = false,
  className,
}: {
  rec: RecommendationDetail;
  action: WorkflowAction;
  /** Pre-select a step (e.g. when opened from that step). */
  defaultStep?: number | null;
  onUploaded?: () => void;
  /** Off where the surrounding desk already shows the action's error once. */
  showActionError?: boolean;
  /** Offer the device camera (phones). */
  allowCamera?: boolean;
  className?: string;
}) {
  useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(defaultStep ? String(defaultStep) : "");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const steps = sortSteps(rec.action_plan?.steps ?? []);
  const busy = uploading || action.mutation.isPending;

  const choose = (next: File | null) => {
    setFile(next);
    setFailed(false);
    setLocalError(null);
    // The previous upload's server error no longer describes this file.
    action.clearError();
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setLocalError(T.common.required);
      return;
    }
    setLocalError(null);
    setFailed(false);
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
          onError: () => setFailed(true),
          onSettled: () => setUploading(false),
        }
      );
    } catch (err) {
      setUploading(false);
      setFailed(true);
      setLocalError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={upload} className={cn("space-y-4", className)} aria-busy={busy}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <FilePicker
            label={T.evidenceRegister.file}
            file={file}
            onChange={choose}
            hint={`${T.evidenceRegister.allowedTypes} · ${T.evidenceRegister.maxSize}`}
          />
          {allowCamera ? (
            <>
              <input
                ref={cameraRef}
                type="file"
                name="camera"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => choose(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full ring-1 ring-line"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="size-4" aria-hidden />
                {T.mobile.takePhoto}
              </Button>
            </>
          ) : null}
        </div>
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
        <TextArea maxLength={NOTE_MAX}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={T.evidenceRegister.descriptionHint}
        />
      </Field>
      {busy ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-primary-light" role="progressbar" aria-label={T.common.uploading}>
          <span className="block h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      ) : null}
      {failed && !localError && !(showActionError && action.error) ? (
        <ErrorBanner message={T.mobile.uploadFailed} />
      ) : null}
      <ErrorBanner message={localError ?? (showActionError ? action.error : null)} />
      <Button type="submit" disabled={busy || !file} className="min-h-12 w-full md:w-auto">
        {failed ? <RotateCcw className="size-4" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        {busy ? T.common.uploading : failed ? T.mobile.retry : T.evidenceRegister.upload}
      </Button>
    </form>
  );
}
