import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  const data = manifest();

  it("describes an installable standalone app branded RAQEEB", () => {
    expect(data.name).toContain("RAQEEB");
    expect(data.name).toContain("رقيب");
    expect(data.short_name).toBe("رقيب");
    expect(data.start_url).toBe("/");
    expect(data.display).toBe("standalone");
    expect(data.theme_color).toBe("#183b4e");
    expect(data.background_color).toBe("#eef1ee");
  });

  it("is Arabic-first and right-to-left", () => {
    expect(data.lang).toBe("ar");
    expect(data.dir).toBe("rtl");
  });

  it("names the municipality without replacing the app name", () => {
    // The institution belongs in the description; the app name stays RAQEEB.
    expect(data.description).toContain("بلدية البيرة");
    expect(data.description).toContain("Al-Bireh Municipality");
    expect(data.short_name).not.toContain("بلدية");
  });

  it("includes 192 and 512 icons without API paths", () => {
    const icons = data.icons ?? [];
    expect(icons.some((icon) => icon.src === "/icons/icon-192.png" && icon.sizes === "192x192")).toBe(true);
    expect(icons.some((icon) => icon.src === "/icons/icon-512.png" && icon.sizes === "512x512")).toBe(true);
    expect(icons.every((icon) => icon.src.startsWith("/icons/"))).toBe(true);
  });
});
