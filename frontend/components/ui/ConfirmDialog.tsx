"use client";

import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";
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

  useFocusTrap(open, panelRef, onCancel, confirmRef);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-overlay/80 p-0 backdrop-blur-sm transition-all sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md animate-scale-in overflow-hidden rounded-t-[20px] bg-surface shadow-2xl ring-1 ring-line sm:rounded-[20px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute end-3 top-3 z-10 flex size-11 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-ink"
          aria-label={T.confirm.cancel}
        >
          <X className="size-5" />
        </button>

        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center sm:p-8">
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-full shadow-inner ring-8",
              tone === "danger"
                ? "bg-danger-light text-danger-dark ring-danger/10"
                : tone === "warn"
                  ? "bg-warning-light text-warning-dark ring-warning/10"
                  : "bg-primary-light text-primary-dark ring-primary/10"
            )}
          >
            <AlertTriangle className="size-7" strokeWidth={2.5} />
          </div>

          <div className="min-w-0 px-8">
            <h2 id="confirm-title" className="font-heading text-xl font-bold text-navy">
              {title}
            </h2>
            {body ? <div className="mt-3 text-[15px] leading-relaxed text-ink-soft">{body}</div> : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-line bg-subtle/50 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:justify-end sm:px-8 sm:py-5">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="min-h-12 w-full min-w-[100px] sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            type="button"
            ref={confirmRef}
            variant={tone === "danger" ? "danger" : tone === "warn" ? "warn" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            className="min-h-12 w-full min-w-[100px] sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
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
