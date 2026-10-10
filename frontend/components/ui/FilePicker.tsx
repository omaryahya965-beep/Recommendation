"use client";

import { Paperclip, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { DEFAULT_MAX_BYTES, FILE_INPUT_ACCEPT, validateSelectedFile } from "@/lib/upload";

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A labelled file field in the app's language. The native input (which would
 * print the browser's own "Choose File / No file chosen") stays in the page
 * for forms and assistive tech but is visually hidden; the drop-zone label is
 * the control. On phones the same input offers the camera for images. Not for
 * use inside `Field` (which is itself a label).
 */
export function FilePicker({
  label,
  file,
  onChange,
  hint,
  required,
  accept = FILE_INPUT_ACCEPT,
  className,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Shown under the placeholder while no file is chosen. */
  hint?: string;
  required?: boolean;
  accept?: string;
  className?: string;
}) {
  useI18n();
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string | null>(null);

  // Say at once why a file cannot be used (type, size) instead of after the
  // upload starts; the server checks again when it receives the file.
  const choose = (next: File | null) => {
    const problem = next ? validateSelectedFile(next, DEFAULT_MAX_BYTES) : null;
    setRefused(problem);
    if (problem && inputRef.current) inputRef.current.value = "";
    onChange(problem ? null : next);
  };

  // Clearing from the parent (e.g. after a successful upload) empties the input too.
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  return (
    <div className={className}>
      <span id={labelId} className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        aria-labelledby={labelId}
        type="file"
        accept={accept}
        required={required && !file}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        className="peer sr-only"
      />
      <label
        htmlFor={inputId}
        className={cn(
          "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
          file ? "border-primary/40 bg-primary-light/30" : "border-line bg-surface hover:border-primary/40"
        )}
      >
        <Paperclip className="size-4 shrink-0 text-primary-dark" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13.5px]", file ? "font-semibold text-ink" : "text-muted")}>
            {file ? file.name : T.caseView.chooseFile}
          </span>
          <span className="block text-[11.5px] text-muted">{file ? sizeLabel(file.size) : hint}</span>
        </span>
        {file ? (
          <button
            type="button"
            aria-label={T.caseView.clearFile}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink"
            onClick={(event) => {
              event.preventDefault();
              choose(null);
            }}
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </label>
      {refused ? (
        <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-danger-dark">
          {refused}
        </p>
      ) : null}
    </div>
  );
}
