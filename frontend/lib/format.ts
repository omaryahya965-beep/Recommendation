/** Display helpers. IDs stay Latin. Dates/numbers follow the active UI locale. */

import { currentT } from "./i18n/messages";
import { getLocale, localeDateTag } from "./i18n/store";

export function formatLongDate(value?: Date): string {
  const date = value ?? new Date();
  return date.toLocaleDateString(localeDateTag(getLocale()), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  });
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
  return date.toLocaleDateString(localeDateTag(getLocale()), {
    day: "numeric",
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(localeDateTag(getLocale()), {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
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

export type AgeingBucket = "1-7" | "8-14" | "15-30" | "30+";

export function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 7) return "1-7";
  if (daysOverdue <= 14) return "8-14";
  if (daysOverdue <= 30) return "15-30";
  return "30+";
}

export function ageingBucketLabel(daysOverdue: number): string {
  const T = currentT();
  const bucket = ageingBucket(daysOverdue);
  const labels: Record<AgeingBucket, string> = {
    "1-7": T.common.ageing17,
    "8-14": T.common.ageing814,
    "15-30": T.common.ageing1530,
    "30+": T.common.ageing30,
  };
  return labels[bucket];
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
