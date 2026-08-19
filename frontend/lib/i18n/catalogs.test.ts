import { describe, expect, it } from "vitest";

import * as ar from "./ar";
import * as en from "./en";

const DICTIONARIES = [
  "T",
  "STATUS_LABELS",
  "STATUS_FAMILY",
  "PLAN_STATUS_LABELS",
  "REVIEW_STATUS_LABELS",
  "APPROVAL_TYPE_LABELS",
  "RESOLUTION_LABELS",
  "REPORT_STATUS_LABELS",
  "RISK_LABELS",
  "ROLE_LABELS",
  "ENGAGEMENT_LABELS",
  "DECISION_LABELS",
  "VERIFICATION_LABELS",
  "RECIPIENT_ROLE_LABELS",
  "NOTIFICATION_TYPE_LABELS",
  "TRAIL_ACTION_LABELS",
] as const;

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const keys = Object.keys(value as object).sort();
  return keys.flatMap((key) => {
    const next = prefix ? `${prefix}.${key}` : key;
    const child = (value as Record<string, unknown>)[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return keyPaths(child, next);
    }
    return [next];
  });
}

describe("i18n catalogs", () => {
  it("exports the same dictionary names in ar and en", () => {
    expect(DICTIONARIES.every((name) => name in ar)).toBe(true);
    expect(DICTIONARIES.every((name) => name in en)).toBe(true);
  });

  it("keeps the same nested keys in every ar/en dictionary", () => {
    const missingInEn: string[] = [];
    const extraInEn: string[] = [];
    for (const name of DICTIONARIES) {
      const arKeys = keyPaths((ar as Record<string, unknown>)[name]);
      const enKeys = keyPaths((en as Record<string, unknown>)[name]);
      for (const key of arKeys) {
        if (!enKeys.includes(key)) missingInEn.push(`${name}.${key}`);
      }
      for (const key of enKeys) {
        if (!arKeys.includes(key)) extraInEn.push(`${name}.${key}`);
      }
    }
    expect(missingInEn, "keys present in ar but missing in en").toEqual([]);
    expect(extraInEn, "keys present in en but missing in ar").toEqual([]);
  });

  it("does not leave empty leaf strings in either locale", () => {
    const empty: string[] = [];
    for (const [tag, catalog] of [
      ["ar", ar],
      ["en", en],
    ] as const) {
      for (const name of DICTIONARIES) {
        const walk = (value: unknown, prefix: string) => {
          if (typeof value === "string") {
            if (value.trim() === "") empty.push(`${tag}.${prefix}`);
            return;
          }
          if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const [key, child] of Object.entries(value)) {
              walk(child, prefix ? `${prefix}.${key}` : key);
            }
          }
        };
        walk((catalog as Record<string, unknown>)[name], name);
      }
    }
    expect(empty).toEqual([]);
  });
});
