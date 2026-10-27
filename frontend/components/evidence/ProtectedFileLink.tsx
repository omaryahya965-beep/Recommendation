"use client";

import { useState, type ReactNode } from "react";

import { errorMessage, openProtectedFile } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/**
 * Opens a file served by an authorization-checked API endpoint (S6). A plain
 * link cannot carry the session token, so the file is fetched with it and
 * shown from a local copy.
 */
export function ProtectedFileLink({
  url,
  fileName,
  className,
  children,
}: {
  url: string;
  fileName: string;
  className?: string;
  children: ReactNode;
}) {
  useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await openProtectedFile(url, fileName);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
