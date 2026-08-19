"use client";

import { useEffect } from "react";

/**
 * Warns before the tab is closed or reloaded while a long form holds unsaved
 * input. In-app navigation is guarded separately by the calling component,
 * because the App Router gives no cancellable route-change event.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
