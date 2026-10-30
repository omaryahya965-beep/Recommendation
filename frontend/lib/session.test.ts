import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, loadAuth, saveAuth } from "./api";
import type { User } from "./types";

const user: User = { id: 1, username: "head", full_name_ar: "رئيس", role: "department_head", department: 1, municipality: 1 };
const STORAGE_KEY = "audit_tracker_auth";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("session refresh (S2, BUG-05)", () => {
  let replace: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    saveAuth({ access: "expired", refresh: "r1", user });
    replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("runs one refresh for many concurrent 401s and retries each request", async () => {
    let refreshCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/api/auth/refresh/")) {
          refreshCalls += 1;
          await new Promise((r) => setTimeout(r, 5));
          return json({ access: "fresh", refresh: "r2" });
        }
        const auth = (init.headers as Record<string, string>).Authorization;
        return auth === "Bearer fresh" ? json({ ok: url }) : json({ code: "token_not_valid" }, 401);
      })
    );
    const results = await Promise.all(["/a/", "/b/", "/c/", "/d/", "/e/"].map((p) => api<{ ok: string }>(p)));
    expect(refreshCalls).toBe(1);
    expect(results.map((r) => r.ok.slice(-3))).toEqual(["/a/", "/b/", "/c/", "/d/", "/e/"]);
    expect(loadAuth()?.refresh).toBe("r2");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the session when refresh is throttled, retries, then reports a translated error", async () => {
    vi.useFakeTimers();
    let refreshCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/auth/refresh/")) {
          refreshCalls += 1;
          return json({ code: "throttled" }, 429);
        }
        return json({ code: "token_not_valid" }, 401);
      })
    );
    const pending = api("/a/").catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await pending;
    expect(refreshCalls).toBeGreaterThan(1);
    expect(loadAuth()?.refresh).toBe("r1");
    expect(replace).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/429|throttled/);
  });

  it("signs out only when the refresh token itself is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/api/auth/refresh/") ? json({ code: "token_not_valid" }, 401) : json({}, 401)))
    );
    await expect(api("/a/")).rejects.toBeInstanceOf(ApiError);
    expect(loadAuth()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});

describe("saved session shape (BUG-07)", () => {
  afterEach(() => localStorage.clear());

  it.each([
    ["empty object", "{}"],
    ["null user", JSON.stringify({ access: "a", refresh: "r", user: null })],
    ["user without role", JSON.stringify({ access: "a", refresh: "r", user: { id: 1 } })],
    ["unknown role", JSON.stringify({ access: "a", refresh: "r", user: { id: 1, role: "root" } })],
    ["json null", "null"],
    ["array", "[]"],
  ])("treats %s as signed out and clears it", (_name, value) => {
    localStorage.setItem(STORAGE_KEY, value);
    expect(loadAuth()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
