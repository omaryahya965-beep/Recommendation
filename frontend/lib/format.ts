/** Display helpers. IDs stay Latin. Dates/numbers follow the active UI locale. */

import { currentT } from "./i18n/messages";
import { getLocale, localeDateTag } from "./i18n/store";

/**
 * Keep a formatted date/time together as one directional unit.
 *
 * An Arabic date such as "11 أكتوبر 2026" mixes Latin digits with an RTL word.
 * Dropped into a `dir="ltr"` wrapper (as many call sites do, to keep numbers
 * from being mirrored) the bidi algorithm reorders it into "أكتوبر 2026 11".
 * Wrapping the result in a directional isolate makes it render as authored
 * whatever context it lands in: RLI…PDI for Arabic, LRI…PDI for English.
 */
function isolate(text: string): string {
  return getLocale() === "ar" ? `⁧${text}⁩` : `⁦${text}⁩`;
}

export function formatLongDate(value?: Date): string {
  const date = value ?? new Date();
  return isolate(
    date.toLocaleDateString(localeDateTag(getLocale()), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      numberingSystem: "latn",
    })
  );
}

export function formatDayParts(value?: Date) {
  const date = value ?? new Date();
  const tag = localeDateTag(getLocale());
  return {
    weekday: date.toLocaleDateString(tag, { weekday: "long", numberingSystem: "latn" }),
    day: date.toLocaleDateString(tag, { day: "numeric", numberingSystem: "latn" }),
    month: date.toLocaleDateString(tag, { month: "long", numberingSystem: "latn" }),
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return isolate(
    date.toLocaleDateString(localeDateTag(getLocale()), {
      day: "numeric",
      month: "long",
      year: "numeric",
      numberingSystem: "latn",
    })
  );
}

/** "5 Oct" (this year) or "5 Oct 2025" — for dense timelines. */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return isolate(
    date.toLocaleDateString(localeDateTag(getLocale()), {
      day: "numeric",
      month: getLocale() === "ar" ? "long" : "short",
      ...(sameYear ? {} : { year: "numeric" as const }),
      numberingSystem: "latn",
    })
  );
}

/** "سبتمبر 2026" / "Sep 2026" for a YYYY-MM-DD month key. */
export function formatMonth(value: string, style: "short" | "long" = "short"): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const date = new Date(year, month - 1, 1);
  return isolate(
    date.toLocaleDateString(localeDateTag(getLocale()), {
      month: getLocale() === "ar" ? "long" : style,
      year: style === "long" ? "numeric" : "2-digit",
      numberingSystem: "latn",
    })
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return isolate(
    date.toLocaleString(localeDateTag(getLocale()), {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    })
  );
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(localeDateTag(getLocale()), {
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString(localeDateTag(getLocale()), { numberingSystem: "latn" });
}

/** The grammatical case the count takes in its Arabic sentence. */
export type CountCase = "nominative" | "accusative" | "genitive";

/**
 * A number of days, worded to agree with the count. Arabic changes the noun
 * with the number (يوم واحد · يومان · 3 أيام · 11 يوماً · 100 يوم) and, for
 * one and two, with its case in the sentence: "متبقٍّ يومان" (nominative),
 * "متأخرة يومين" (accusative), "منذ يومين" (genitive). English: day / days.
 */
export function dayCount(days: number, grammaticalCase: CountCase = "nominative"): string {
  const n = Math.abs(Math.round(days));
  if (getLocale() === "en") return n === 1 ? "1 day" : `${formatNumber(n)} days`;
  if (n === 1) return grammaticalCase === "accusative" ? "يوماً واحداً" : "يوم واحد";
  if (n === 2) return grammaticalCase === "nominative" ? "يومان" : "يومين";
  const lastTwo = n % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return `${n} أيام`;
  if (lastTwo >= 11) return `${n} يوماً`;
  return `${n} يوم`;
}

/** A counted phrase per plural category; `{n}` is the number. */
export type PluralForms = Record<"one" | "two" | "few" | "many" | "other", string>;

/**
 * Picks the form that agrees with `n` (Arabic: one · two · few 3–10 ·
 * many 11–99 · other; English: one · other), via Intl.PluralRules.
 */
export function plural(n: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(getLocale() === "en" ? "en" : "ar").select(n);
  const form = category in forms ? forms[category as keyof PluralForms] : forms.other;
  return form.replace("{n}", formatNumber(n));
}

/** How many times: مرة واحدة · مرتين · 3 مرات · 11 مرة; once · twice · 3 times. */
export function timesCount(times: number): string {
  const n = Math.abs(Math.round(times));
  if (getLocale() === "en") return n === 1 ? "once" : n === 2 ? "twice" : `${formatNumber(n)} times`;
  if (n === 1) return "مرة واحدة";
  if (n === 2) return "مرتين";
  const lastTwo = n % 100;
  return lastTwo >= 3 && lastTwo <= 10 ? `${n} مرات` : `${n} مرة`;
}

/** Human-friendly elapsed time from a real timestamp. Exact clock stays on hover. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const T = currentT();
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return T.relative.now;
  if (minutes === 1) return T.relative.minute;
  if (minutes === 2) return T.relative.twoMinutes;
  if (minutes < 60) {
    const key = minutes < 11 ? T.relative.minutesFew : T.relative.minutesMany;
    return key.replace("{n}", String(minutes));
  }
  const hours = Math.round(minutes / 60);
  if (hours === 1) return T.relative.hour;
  if (hours === 2) return T.relative.twoHours;
  if (hours < 24) {
    const key = hours < 11 ? T.relative.hoursFew : T.relative.hoursMany;
    return key.replace("{n}", String(hours));
  }
  const days = Math.round(hours / 24);
  if (days === 1) return T.relative.yesterday;
  if (days === 2) return T.relative.twoDaysAgo;
  if (days < 7) return T.relative.daysAgo.replace("{n}", String(days));
  return formatDate(value);
}

/** @deprecated Use relativeTime — kept so existing imports keep working. */
export const relativeTimeAr = relativeTime;

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * YYYY-MM-DD for a date in the user's own timezone. `toISOString()` gives the
 * UTC date, which is the previous day for hours after local midnight.
 */
export function localISODate(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fileNameFromUrl(url: string): string {
  try {
    const path = decodeURIComponent(url.split("?")[0] ?? url);
    return path.split("/").filter(Boolean).pop() || url;
  } catch {
    return url;
  }
}

export function fileExt(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() ?? "FILE").toUpperCase() : "FILE";
}

export function recordCode(id: number, prefix = "REC"): string {
  return `${prefix}-${String(id).padStart(4, "0")}`;
}
