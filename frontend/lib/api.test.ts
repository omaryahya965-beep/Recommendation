import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, errorMessage, loadAuth, saveAuth } from "./api";
import type { User } from "./types";

const user: User = {
  id: 1,
  username: "audit1",
  full_name_ar: "مدقق",
  role: "audit",
  department: null,
  municipality: 1,
};

const auth = {
  access: "access-token",
  refresh: "refresh-token",
  user,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("round-trips auth state and ignores corrupt storage", () => {
    expect(loadAuth()).toBeNull();
    saveAuth(auth);
    expect(loadAuth()).toEqual(auth);
    localStorage.setItem("audit_tracker_auth", "{not-json");
    expect(loadAuth()).toBeNull();
  });

  it("reads DRF detail strings from ApiError bodies", () => {
    const err = new ApiError(400, { detail: "Invalid token." }, "API 400");
    expect(errorMessage(err)).toBe("Invalid token.");
  });

  it("joins field-level DRF errors into one message", () => {
    const err = new ApiError(
      400,
      { title: ["This field is required."], risk_level: "Invalid choice." },
      "API 400"
    );
    const message = errorMessage(err);
    expect(message).toContain("title:");
    expect(message).toContain("This field is required.");
    expect(message).toContain("risk_level:");
  });

  it("sends the bearer token and returns JSON on success", async () => {
    saveAuth(auth);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 9, status: "draft" }));
    const data = await api<{ id: number; status: string }>("/api/recommendations/9/");
    expect(data).toEqual({ id: 9, status: "draft" });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/recommendations/9/",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      })
    );
  });

  it("throws ApiError when the server returns a failure status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: "Not found." }, 404));
    await expect(api("/api/recommendations/99/")).rejects.toMatchObject({
      status: 404,
      body: { detail: "Not found." },
    });
  });

  it("refreshes an expired access token and retries the original request", async () => {
    saveAuth(auth);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Token expired." }, 401))
      .mockResolvedValueOnce(jsonResponse({ access: "new-access" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const data = await api<{ ok: boolean }>("/api/dashboard/");
    expect(data).toEqual({ ok: true });
    expect(loadAuth()?.access).toBe("new-access");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/auth/refresh/",
      expect.objectContaining({ method: "POST" })
    );
    expect(vi.mocked(fetch).mock.calls[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer new-access" }),
      })
    );
  });
});

describe("API base URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses NEXT_PUBLIC_API_URL when set", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    const { api, saveAuth } = await import("./api");
    saveAuth(auth);
    await api("/api/dashboard/");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/api/dashboard/",
      expect.anything()
    );
  });
});
