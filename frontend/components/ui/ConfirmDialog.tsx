"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Base";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

/**
 * Modal confirmation for actions that are written to the immutable audit trail
 * and cannot be undone: ratification, closure, returning work, verification
 * verdicts. Traps focus and closes on Escape.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = T.confirm.cancel,
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger" | "warn";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useI18n();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md animate-fade-in overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-lg"
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              tone === "danger"
                ? "bg-danger-light text-danger-dark"
                : tone === "warn"
                  ? "bg-warning-light text-warning-dark"
                  : "bg-primary-light text-primary-dark"
            )}
          >
            <AlertTriangle className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-heading text-base font-semibold text-navy">
              {title}
            </h2>
            {body ? <div className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</div> : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-subtle/50 px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "danger" ? "danger" : tone === "warn" ? "warn" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a workflow action so the button opens a confirmation first.
 * Returns the props to spread and the dialog element to render.
 */
export function useConfirm({
  title,
  body,
  confirmLabel,
  tone,
  onConfirm,
  busy,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger" | "warn";
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const confirm = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);

  const dialog = (
    <ConfirmDialog
      open={open}
      title={title}
      body={body ?? T.confirm.irreversible}
      confirmLabel={confirmLabel}
      tone={tone}
      busy={busy}
      onConfirm={confirm}
      onCancel={() => setOpen(false)}
    />
  );

  return { ask: () => setOpen(true), dialog };
}
