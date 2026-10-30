"use client";

import { useEffect, useId } from "react";

/**
 * Guards a long form while it holds unsaved input.
 *
 * - Closing or reloading the tab: the browser's own beforeunload prompt.
 * - In-app links (sidebar, breadcrumbs, cards): the App Router has no
 *   cancellable route-change event, so a capture-phase click listener stops
 *   the navigation and asks first (components/shell/UnsavedChangesDialog).
 */
const dirtyForms = new Set<string>();
export const UNSAVED_NAVIGATION = "raqeeb:unsaved-navigation";

export function hasUnsavedChanges() {
  return dirtyForms.size > 0;
}

/** After "leave without saving": forget every dirty form so nothing re-asks. */
export function discardUnsavedChanges() {
  dirtyForms.clear();
}

function internalHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.pathname + url.search + url.hash;
}

function onDocumentClick(event: MouseEvent) {
  if (!hasUnsavedChanges()) return;
  const href = internalHref(event);
  if (!href) return;
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent(UNSAVED_NAVIGATION, { detail: { href } }));
}

export function useUnsavedChanges(dirty: boolean) {
  const id = useId();

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    dirtyForms.add(id);
    if (dirtyForms.size === 1) document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      dirtyForms.delete(id);
      if (dirtyForms.size === 0) document.removeEventListener("click", onDocumentClick, true);
    };
  }, [dirty, id]);
}
