import { describe, expect, it } from "vitest";

import { BRAND, appName, municipalityName, tagline } from "./brand";
import * as ar from "./i18n/ar";
import * as en from "./i18n/en";

/**
 * The application is RAQEEB / رقيب. The institution is Al-Bireh Municipality.
 * These are different things, and the most likely branding regression is one
 * being substituted for the other.
 */
describe("brand identity", () => {
  it("names the application in both scripts", () => {
    expect(appName("ar")).toBe("رقيب");
    expect(appName("en")).toBe("RAQEEB");
  });

  it("keeps the municipality name separate from the app name", () => {
    expect(municipalityName("ar")).toBe("بلدية البيرة");
    expect(municipalityName("en")).toBe("Al-Bireh Municipality");
    expect(municipalityName("ar")).not.toBe(appName("ar"));
    expect(municipalityName("en")).not.toBe(appName("en"));
  });

  it("does not put the municipality name inside the app name", () => {
    expect(BRAND.appNameAr).not.toContain("بلدية");
    expect(BRAND.appNameEn.toLowerCase()).not.toContain("bireh");
  });

  it("describes what the platform does, separately from its name", () => {
    expect(tagline("ar")).toContain("الرقابة الداخلية");
    expect(tagline("en")).toContain("Internal Audit");
  });
});

describe("catalogs carry the new branding", () => {
  it("uses RAQEEB as the application name in both locales", () => {
    expect(ar.T.appName).toBe("رقيب");
    expect(en.T.appName).toBe("RAQEEB");
  });

  it("no longer carries the retired product names", () => {
    const blob = JSON.stringify(ar.T) + JSON.stringify(en.T);
    expect(blob).not.toContain("Audit Trailblazer");
    expect(blob).not.toContain("Internal Audit Platform");
    expect(blob).not.toContain("منصة الرقابة الداخلية");
  });

  it("still credits the municipality as the owning institution", () => {
    expect(ar.T.login.municipalityName).toBe("بلدية البيرة");
    expect(en.T.login.municipalityName).toBe("Al-Bireh Municipality");
  });
});

describe("engagement type wording", () => {
  it("distinguishes assurance from advisory in both locales", () => {
    expect(ar.REPORT_TYPE_LABELS.assurance).toBe("تقرير تأكيدي");
    expect(ar.REPORT_TYPE_LABELS.advisory).toBe("تقرير استشاري");
    expect(en.REPORT_TYPE_LABELS.assurance).toBe("Assurance report");
    expect(en.REPORT_TYPE_LABELS.advisory).toBe("Advisory report");
  });

  it("offers engagement wording for when the mission is meant", () => {
    expect(ar.ENGAGEMENT_TYPE_LABELS.assurance).toBe("مهمة تأكيدية");
    expect(ar.ENGAGEMENT_TYPE_LABELS.advisory).toBe("مهمة استشارية");
  });

  it("covers exactly the two backend engagement types", () => {
    for (const dict of [ar.REPORT_TYPE_LABELS, ar.ENGAGEMENT_TYPE_LABELS]) {
      expect(Object.keys(dict).sort()).toEqual(["advisory", "assurance"]);
    }
  });
});
