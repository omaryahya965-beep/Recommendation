"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import * as ar from "./ar";
import * as en from "./en";
import { getLocale, localeDir, setLocale, subscribeLocale, type Locale } from "./store";

export type { Locale } from "./store";
export { getLocale, setLocale, applyDocumentLocale, localeDateTag, LOCALE_STORAGE_KEY } from "./store";

export type Messages = typeof ar.T;

export interface I18nBundle {
  locale: Locale;
  dir: "rtl" | "ltr";
  T: typeof ar.T;
  STATUS_LABELS: typeof ar.STATUS_LABELS;
  STATUS_FAMILY: typeof ar.STATUS_FAMILY;
  PLAN_STATUS_LABELS: typeof ar.PLAN_STATUS_LABELS;
  REVIEW_STATUS_LABELS: typeof ar.REVIEW_STATUS_LABELS;
  APPROVAL_TYPE_LABELS: typeof ar.APPROVAL_TYPE_LABELS;
  RESOLUTION_LABELS: typeof ar.RESOLUTION_LABELS;
  REPORT_STATUS_LABELS: typeof ar.REPORT_STATUS_LABELS;
  RISK_LABELS: typeof ar.RISK_LABELS;
  ROLE_LABELS: typeof ar.ROLE_LABELS;
  ENGAGEMENT_LABELS: typeof ar.ENGAGEMENT_LABELS;
  DECISION_LABELS: typeof ar.DECISION_LABELS;
  VERIFICATION_LABELS: typeof ar.VERIFICATION_LABELS;
  RECIPIENT_ROLE_LABELS: typeof ar.RECIPIENT_ROLE_LABELS;
  NOTIFICATION_TYPE_LABELS: typeof ar.NOTIFICATION_TYPE_LABELS;
  TRAIL_ACTION_LABELS: typeof ar.TRAIL_ACTION_LABELS;
  setLocale: (locale: Locale) => void;
}

function source(locale: Locale = getLocale()): typeof ar {
  return (locale === "en" ? en : ar) as typeof ar;
}

function liveDict<T extends object>(getter: () => T): T {
  return new Proxy({} as T, {
    get(_, prop, receiver) {
      if (prop === Symbol.toStringTag) return "Object";
      const val = Reflect.get(getter(), prop, receiver);
      if (val && typeof val === "object" && !Array.isArray(val)) {
        return liveDict(() => Reflect.get(getter(), prop) as object);
      }
      return val;
    },
    ownKeys() {
      return Reflect.ownKeys(getter());
    },
    getOwnPropertyDescriptor(_, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(getter(), prop);
      if (desc) return { ...desc, configurable: true };
      return undefined;
    },
    has(_, prop) {
      return Reflect.has(getter(), prop);
    },
  });
}

export function getMessages(): I18nBundle {
  const locale = getLocale();
  const src = source(locale);
  return {
    locale,
    dir: localeDir(locale),
    T: src.T,
    STATUS_LABELS: src.STATUS_LABELS,
    STATUS_FAMILY: src.STATUS_FAMILY,
    PLAN_STATUS_LABELS: src.PLAN_STATUS_LABELS,
    REVIEW_STATUS_LABELS: src.REVIEW_STATUS_LABELS,
    APPROVAL_TYPE_LABELS: src.APPROVAL_TYPE_LABELS,
    RESOLUTION_LABELS: src.RESOLUTION_LABELS,
    REPORT_STATUS_LABELS: src.REPORT_STATUS_LABELS,
    RISK_LABELS: src.RISK_LABELS,
    ROLE_LABELS: src.ROLE_LABELS,
    ENGAGEMENT_LABELS: src.ENGAGEMENT_LABELS,
    DECISION_LABELS: src.DECISION_LABELS,
    VERIFICATION_LABELS: src.VERIFICATION_LABELS,
    RECIPIENT_ROLE_LABELS: src.RECIPIENT_ROLE_LABELS,
    NOTIFICATION_TYPE_LABELS: src.NOTIFICATION_TYPE_LABELS,
    TRAIL_ACTION_LABELS: src.TRAIL_ACTION_LABELS,
    setLocale,
  };
}

/** Live dictionaries — always read the active locale. Pair with LocaleBridge so the tree re-renders. */
export const T = liveDict(() => source().T);
export const STATUS_LABELS = liveDict(() => source().STATUS_LABELS);
export const STATUS_FAMILY = liveDict(() => source().STATUS_FAMILY);
export const PLAN_STATUS_LABELS = liveDict(() => source().PLAN_STATUS_LABELS);
export const REVIEW_STATUS_LABELS = liveDict(() => source().REVIEW_STATUS_LABELS);
export const APPROVAL_TYPE_LABELS = liveDict(() => source().APPROVAL_TYPE_LABELS);
export const RESOLUTION_LABELS = liveDict(() => source().RESOLUTION_LABELS);
export const REPORT_STATUS_LABELS = liveDict(() => source().REPORT_STATUS_LABELS);
export const RISK_LABELS = liveDict(() => source().RISK_LABELS);
export const ROLE_LABELS = liveDict(() => source().ROLE_LABELS);
export const ENGAGEMENT_LABELS = liveDict(() => source().ENGAGEMENT_LABELS);
export const DECISION_LABELS = liveDict(() => source().DECISION_LABELS);
export const VERIFICATION_LABELS = liveDict(() => source().VERIFICATION_LABELS);
export const RECIPIENT_ROLE_LABELS = liveDict(() => source().RECIPIENT_ROLE_LABELS);
export const NOTIFICATION_TYPE_LABELS = liveDict(() => source().NOTIFICATION_TYPE_LABELS);
export const TRAIL_ACTION_LABELS = liveDict(() => source().TRAIL_ACTION_LABELS);

const LocaleContext = createContext<Locale>("ar");

export function useI18n(): I18nBundle {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => "ar" as Locale);
  useContext(LocaleContext);
  const change = useCallback((next: Locale) => setLocale(next), []);
  return useMemo(() => ({ ...getMessages(), locale, dir: localeDir(locale), setLocale: change }), [locale, change]);
}

/** Subscribe the React tree to locale changes without remounting routes. */
export function LocaleBridge({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => "ar" as Locale);
  return createElement(LocaleContext.Provider, { value: locale }, children);
}
