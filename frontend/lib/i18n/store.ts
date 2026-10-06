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
/**
 * The server renders Arabic (it cannot read the saved choice). Until the app
 * has hydrated, every render — React text, dates, labels — must use that same
 * locale, or an English session hydrates English text over Arabic HTML: React
 * then throws the tree away and client-renders the whole document, which also
 * strips <html data-theme> (dark mode lost). LocaleBridge calls markHydrated()
 * once the first commit is done, and the tree re-renders in the saved locale.
 * The pre-paint script already set <html lang/dir>, so the layout never flips.
 */
let hydrated = false;
if (typeof window !== "undefined") {
  current = readStored();
  applyDocumentLocale(current);
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

let scoped: Locale | null = null;

export function getLocale(): Locale {
  if (scoped) return scoped;
  return hydrated ? current : "ar";
}

/**
 * Build text in a given locale (synchronously). For a component that can
 * hydrate after the rest of the app — inside a Suspense boundary, once the
 * locale has already switched — so the labels it computes from `useI18n()`'s
 * locale still match the server HTML it hydrates.
 */
export function inLocale<R>(locale: Locale, build: () => R): R {
  const previous = scoped;
  scoped = locale;
  try {
    return build();
  } finally {
    scoped = previous;
  }
}

/** The app has hydrated: switch rendering to the saved locale. */
export function markHydrated() {
  if (hydrated) return;
  hydrated = true;
  if (current !== "ar") listeners.forEach((listener) => listener());
}

export function subscribeLocale(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(next: Locale) {
  const rendered = getLocale();
  // Choosing a language is something a live app does.
  hydrated = true;
  if (current === next) {
    applyDocumentLocale(next);
    if (rendered !== next) listeners.forEach((listener) => listener());
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
