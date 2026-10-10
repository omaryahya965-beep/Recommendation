"use client";

import { useSyncExternalStore } from "react";

/** Breakpoints, matching Tailwind's md (768) and lg (1024). */
export const PHONE_QUERY = "(max-width: 767.98px)";
export const TABLET_QUERY = "(min-width: 768px) and (max-width: 1023.98px)";

/**
 * A CSS media query as React state. The server render (and hydration) uses
 * `serverValue`, then the real value applies — so the static HTML never
 * mismatches. Pages whose data loads on the client switch layouts before any
 * content is shown.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/** Phones (below 768px): the mobile app screens. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/** Tablets (768–1023px): desktop screens with the navigation as a rail. */
export function useIsTablet(): boolean {
  return useMediaQuery(TABLET_QUERY);
}
