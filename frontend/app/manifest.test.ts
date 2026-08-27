import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  const data = manifest();

  it("describes an installable standalone app", () => {
    expect(data.name).toBe("Internal Audit System");
    expect(data.short_name).toBe("Audit");
    expect(data.description).toBe("Internal Audit Recommendation Management System");
    expect(data.start_url).toBe("/");
    expect(data.display).toBe("standalone");
    expect(data.theme_color).toBe("#183b4e");
    expect(data.background_color).toBe("#eef1ee");
  });

  it("includes 192 and 512 icons without API paths", () => {
    const icons = data.icons ?? [];
    expect(icons.some((icon) => icon.src === "/icons/icon-192.png" && icon.sizes === "192x192")).toBe(true);
    expect(icons.some((icon) => icon.src === "/icons/icon-512.png" && icon.sizes === "512x512")).toBe(true);
    expect(icons.every((icon) => icon.src.startsWith("/icons/"))).toBe(true);
  });
});
