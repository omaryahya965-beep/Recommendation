import { describe, expect, it } from "vitest";

import { dayCount, formatDate, formatDateTime, plural, timesCount } from "./format";
import { T as AR } from "./i18n/ar";
import { T as EN } from "./i18n/en";
import { setLocale } from "./i18n/store";

const RLI = "\u2067";
const LRI = "\u2066";
const PDI = "\u2069";

describe("date formatting is direction-safe", () => {
  it("wraps Arabic dates in an RTL isolate so 'dir=ltr' parents cannot scramble them", () => {
    setLocale("ar");
    const out = formatDate("2026-10-11");
    expect(out.startsWith(RLI)).toBe(true);
    expect(out.endsWith(PDI)).toBe(true);
    // Latin digits (kept deliberately) and the Arabic month name both present.
    expect(out).toContain("2026");
    expect(out).toContain("أكتوبر");
  });

  it("wraps English dates in an LTR isolate", () => {
    setLocale("en");
    const out = formatDate("2026-10-11");
    expect(out.startsWith(LRI)).toBe(true);
    expect(out).toContain("October");
    setLocale("ar");
  });

  it("isolates date-times too", () => {
    setLocale("ar");
    expect(formatDateTime("2026-10-11T10:30:00Z").startsWith(RLI)).toBe(true);
  });

  it("returns the em dash placeholder unwrapped for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("day counts agree with the number", () => {
  it("inflects the Arabic noun by count and case", () => {
    setLocale("ar");
    expect(dayCount(1)).toBe("يوم واحد");
    expect(dayCount(1, "accusative")).toBe("يوماً واحداً");
    expect(dayCount(2)).toBe("يومان");
    expect(dayCount(2, "accusative")).toBe("يومين");
    expect(dayCount(2, "genitive")).toBe("يومين");
    expect(dayCount(3)).toBe("3 أيام");
    expect(dayCount(10)).toBe("10 أيام");
    expect(dayCount(11)).toBe("11 يوماً");
    expect(dayCount(30)).toBe("30 يوماً");
    expect(dayCount(100)).toBe("100 يوم");
    expect(dayCount(103)).toBe("103 أيام");
  });

  it("uses day/days in English", () => {
    setLocale("en");
    expect(dayCount(1)).toBe("1 day");
    expect(dayCount(2)).toBe("2 days");
    expect(dayCount(0)).toBe("0 days");
    setLocale("ar");
  });
});

describe("repeat counts", () => {
  it("words how many times in both languages", () => {
    setLocale("ar");
    expect([1, 2, 3, 10, 11].map(timesCount)).toEqual(["مرة واحدة", "مرتين", "3 مرات", "10 مرات", "11 مرة"]);
    setLocale("en");
    expect([1, 2, 5].map(timesCount)).toEqual(["once", "twice", "5 times"]);
    setLocale("ar");
  });
});

describe("counted phrases follow the plural rules", () => {
  it("chooses the Arabic form for one, two, 3–10, 11–99 and 100", () => {
    setLocale("ar");
    const files = AR.caseView.summary.files;
    expect([1, 2, 3, 11, 100].map((n) => plural(n, files))).toEqual([
      "ملف واحد",
      "ملفان",
      "3 ملفات",
      "11 ملفاً",
      "100 ملف",
    ]);
  });

  it("uses singular and plural in English", () => {
    setLocale("en");
    expect(plural(1, EN.caseView.summary.events)).toBe("1 event");
    expect(plural(14, EN.caseView.summary.events)).toBe("14 events");
    setLocale("ar");
  });
});
