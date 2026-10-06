"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";
import { Button } from "@/components/ui/Base";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

/**
 * A modal bottom sheet (phones) that becomes a centred dialog from md up.
 *
 * - Focus is trapped inside and returned on close; Escape and the backdrop
 *   close it; the page behind does not scroll.
 * - `dirty`: closing asks first, so a half-filled form is not lost by a
 *   stray tap on the backdrop.
 * - The body scrolls; `footer` stays pinned above the home indicator.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dirty = false,
  size = "auto",
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean;
  /** "full" takes (almost) the whole screen height — for long forms. */
  size?: "auto" | "full";
  testId?: string;
}) {
  useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);

  // The discard question takes focus (on the safe answer) so keyboard and
  // screen-reader users meet it; Escape while it is open means "keep editing".
  useEffect(() => {
    if (confirming) keepEditingRef.current?.focus();
  }, [confirming]);

  const requestClose = () => {
    if (confirming) setConfirming(false);
    else if (dirty) setConfirming(true);
    else onClose();
  };
  useFocusTrap(open, panelRef, requestClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6" data-testid={testId}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={T.nav.close}
        className="absolute inset-0 bg-overlay backdrop-blur-[2px] animate-fade-in"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-t-[1.25rem] bg-surface shadow-2xl animate-sheet-up",
          "md:max-w-lg md:rounded-2xl md:animate-scale-in",
          size === "full" ? "h-[92dvh] md:h-auto md:max-h-[88dvh]" : "max-h-[88dvh]"
        )}
      >
        {/* Grab handle (visual only on phones). */}
        <div className="flex justify-center pt-2.5 md:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        <header className="flex items-start gap-3 border-b border-line/70 px-4 pb-3 pt-2 md:px-5 md:pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-heading text-[17px] font-bold leading-snug text-navy">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label={T.nav.close}
            className="-me-1 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-subtle"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">{children}</div>

        {footer ? (
          <footer className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">
            {footer}
          </footer>
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" aria-hidden />
        )}

        {confirming ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-discard`}
            className="absolute inset-x-3 bottom-3 rounded-2xl border border-line bg-elevated p-4 shadow-2xl"
          >
            <p id={`${titleId}-discard`} className="text-[14px] font-semibold text-ink">
              {T.mobile.discardChanges}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="danger"
                className="min-h-11 flex-1"
                onClick={() => {
                  setConfirming(false);
                  onClose();
                }}
              >
                {T.mobile.discard}
              </Button>
              <Button ref={keepEditingRef} type="button" variant="ghost" className="min-h-11 flex-1" onClick={() => setConfirming(false)}>
                {T.mobile.keepEditing}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
