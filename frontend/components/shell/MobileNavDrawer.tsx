"use client";

import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";
import { T, useI18n } from "@/lib/i18n";

export function MobileNavDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(open, panelRef, onClose, closeRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        aria-label={T.nav.close}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={T.nav.menu}
        className="safe-top absolute inset-y-0 start-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col bg-sidebar text-sidebar-text shadow-2xl animate-drawer-in"
      >
        <button
          ref={closeRef}
          type="button"
          className="absolute end-2 top-[max(0.5rem,env(safe-area-inset-top))] z-10 flex size-12 items-center justify-center rounded-full text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
          onClick={onClose}
          aria-label={T.nav.close}
        >
          <X className="size-5" />
        </button>
        {children}
      </aside>
    </div>
  );
}
