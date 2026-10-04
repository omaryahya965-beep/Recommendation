"use client";

import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { errorMessage, openProtectedFile, saveProtectedFile } from "@/lib/api";
import { fileNameFromUrl } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { Evidence } from "@/lib/types";

/** The original file name of an evidence upload (never the API route name). */
export function evidenceFileName(evidence: Pick<Evidence, "file" | "file_url">): string {
  return fileNameFromUrl(evidence.file || evidence.file_url || "");
}

/**
 * View and Download for a protected evidence file. Both go through the
 * authenticated, audited API endpoint (`file_url`): the session token is sent
 * with the request and the file is handed to the browser as a local object
 * URL, so a plain link — which cannot carry the token — is never used.
 */
export function EvidenceFileActions({
  evidence,
  className,
  size = "md",
}: {
  evidence: Pick<Evidence, "file" | "file_url">;
  className?: string;
  size?: "sm" | "md";
}) {
  useI18n();
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const source = evidence.file_url;
  const name = evidenceFileName(evidence);

  const run = async (kind: "view" | "download", event: React.MouseEvent) => {
    event.stopPropagation();
    if (!source || busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "view") await openProtectedFile(source, name);
      else await saveProtectedFile(source, name);
    } catch (err) {
      setError(errorMessage(err) || T.evidence.openFailed);
    } finally {
      setBusy(null);
    }
  };

  const base =
    size === "sm"
      ? "min-h-9 px-2.5 text-[12px]"
      : "min-h-11 px-3.5 text-[13px]";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={(event) => run("view", event)}
          disabled={!source || busy !== null}
          aria-busy={busy === "view"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/8 font-bold text-primary-dark transition-colors hover:bg-primary/15 disabled:opacity-50",
            base
          )}
        >
          {busy === "view" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />}
          {T.evidence.view}
        </button>
        <button
          type="button"
          onClick={(event) => run("download", event)}
          disabled={!source || busy !== null}
          aria-busy={busy === "download"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-line bg-subtle/60 font-bold text-ink-soft transition-colors hover:bg-subtle disabled:opacity-50",
            base
          )}
        >
          {busy === "download" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
          {T.evidence.download}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[12px] font-medium text-danger-dark">
          {error}
        </p>
      ) : null}
    </div>
  );
}
