import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime } from "./format";
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
