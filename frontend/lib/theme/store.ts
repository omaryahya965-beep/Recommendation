export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "audit_theme";

type Listener = () => void;

const listeners = new Set<Listener>();

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? (systemDark() ? "dark" : "light") : preference;
}

export function applyDocumentTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

let current: ThemePreference = "system";
if (typeof window !== "undefined") {
  current = readStored();
  applyDocumentTheme(current);
}

export function getTheme(): ThemePreference {
  return current;
}

export function subscribeTheme(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(next: ThemePreference) {
  current = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }
  applyDocumentTheme(next);
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current === "system") {
      applyDocumentTheme("system");
      listeners.forEach((listener) => listener());
    }
  });
}
