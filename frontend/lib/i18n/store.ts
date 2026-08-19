export type Locale = "ar" | "en";

export const LOCALE_STORAGE_KEY = "audit_locale";

type Listener = () => void;

const listeners = new Set<Listener>();

function readStored(): Locale {
  if (typeof window === "undefined") return "ar";
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

let current: Locale = "ar";
if (typeof window !== "undefined") {
  current = readStored();
  applyDocumentLocale(current);
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function getLocale(): Locale {
  return current;
}

export function subscribeLocale(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(next: Locale) {
  if (current === next) {
    applyDocumentLocale(next);
    return;
  }
  current = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }
  applyDocumentLocale(next);
  listeners.forEach((listener) => listener());
}

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function localeDateTag(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}
