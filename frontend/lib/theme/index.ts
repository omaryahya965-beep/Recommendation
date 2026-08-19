"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  getTheme,
  resolveTheme,
  setTheme,
  subscribeTheme,
  type ThemePreference,
} from "./store";

export type { ThemePreference, ResolvedTheme } from "./store";
export { getTheme, setTheme, applyDocumentTheme, THEME_STORAGE_KEY } from "./store";

export function useTheme() {
  const preference = useSyncExternalStore(subscribeTheme, getTheme, () => "system" as ThemePreference);
  const resolved = resolveTheme(preference);
  const change = useCallback((next: ThemePreference) => setTheme(next), []);
  return useMemo(
    () => ({ preference, resolved, setTheme: change }),
    [preference, resolved, change]
  );
}
