import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  ApiError,
  classifyLoginError,
  errorMessage,
  isViewableFile,
  loadAuth,
  openProtectedFile,
  saveAuth,
  saveProtectedFile,
} from "./api";
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

  it("translates an error code instead of showing the server's English", () => {
    const err = new ApiError(
      409,
      { detail: "Required steps are not completed yet.", code: "required_steps_incomplete", params: { count: 2 } },
      "API 409"
    );
    const message = errorMessage(err);
    expect(message).toContain("2");
    expect(message).not.toContain("Required steps");
  });

  it("names each invalid field in the UI language", () => {
    const err = new ApiError(
      400,
      {
        title: ["This field is required."],
        risk_level: ["Invalid choice."],
        code: "validation_error",
        field_codes: { title: ["required"], risk_level: ["invalid_choice"] },
      },
      "API 400"
    );
    const message = errorMessage(err);
    expect(message).toContain("العنوان");
    expect(message).toContain("الخطورة");
    expect(message).not.toContain("This field is required.");
  });

  it("never shows English server text on an Arabic screen for an unknown code", () => {
    const err = new ApiError(400, { detail: "Invalid token." }, "API 400");
    expect(errorMessage(err)).not.toContain("Invalid token.");
    expect(errorMessage(err)).toContain("400");
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

describe("ROLE_PROFILE", () => {
  it("maps every role to its own profile route", async () => {
    const { ROLE_PROFILE } = await import("./api");
    expect(ROLE_PROFILE).toEqual({
      audit: "/audit/profile",
      department_head: "/department/profile",
      employee: "/employee/profile",
      council: "/council/profile",
    });
  });
});

describe("sign-in failure classification", () => {
  it("treats only 400/401 as wrong credentials", () => {
    expect(classifyLoginError(new ApiError(401, null, "x")).kind).toBe("credentials");
    expect(classifyLoginError(new ApiError(400, null, "x")).kind).toBe("credentials");
  });

  it("reports throttling with the wait time when known", () => {
    expect(classifyLoginError(new ApiError(429, { retry_after: 42 }, "x"))).toEqual({
      kind: "throttled",
      retryAfter: 42,
    });
    expect(
      classifyLoginError(new ApiError(429, { detail: "Expected available in 17 seconds." }, "x"))
    ).toEqual({ kind: "throttled", retryAfter: 17 });
    expect(classifyLoginError(new ApiError(429, null, "x"))).toEqual({ kind: "throttled", retryAfter: null });
  });

  it("separates server errors from a dead connection", () => {
    expect(classifyLoginError(new ApiError(500, null, "x")).kind).toBe("server");
    expect(classifyLoginError(new ApiError(503, null, "x")).kind).toBe("server");
    expect(classifyLoginError(new TypeError("Failed to fetch")).kind).toBe("network");
  });
});

describe("protected files", () => {
  beforeEach(() => {
    localStorage.clear();
    saveAuth(auth);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("knows which types a tab can display", () => {
    expect(isViewableFile("proof.PDF")).toBe(true);
    expect(isViewableFile("scan.jpeg")).toBe(true);
    expect(isViewableFile("sheet.xlsx")).toBe(false);
    expect(isViewableFile("archive.zip")).toBe(false);
  });

  it("sends the session token to the API and saves the file under its own name", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("%PDF-1.4", { status: 200 }));
    const created = vi.fn(() => "blob:local/1");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await saveProtectedFile("http://127.0.0.1:8000/api/evidence/5/download/", "proof.pdf");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8000/api/evidence/5/download/");
    expect((init as RequestInit).headers).toEqual({ Authorization: "Bearer access-token" });
    expect(click).toHaveBeenCalledOnce();
    const blob = (created.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe("application/pdf");
  });

  it("saves a PDF under its real name when the browser has no PDF viewer (BUG-14)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("%PDF-1.4", { status: 200 }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:local/2"), revokeObjectURL: vi.fn() }));
    vi.stubGlobal("navigator", { ...navigator, pdfViewerEnabled: false });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });

    await openProtectedFile("http://127.0.0.1:8000/api/evidence/5/download/", "تقرير التسوية.pdf");

    expect(open).not.toHaveBeenCalled();
    expect(names).toEqual(["تقرير التسوية.pdf"]);
  });

  it("still opens a PDF in a tab when the browser can show it", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("%PDF-1.4", { status: 200 }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:local/3"), revokeObjectURL: vi.fn() }));
    vi.stubGlobal("navigator", { ...navigator, pdfViewerEnabled: true });
    const tab = { closed: false, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockImplementation(() => tab as unknown as Window);

    await openProtectedFile("http://127.0.0.1:8000/api/evidence/5/download/", "proof.pdf");

    expect(tab.location.href).toBe("blob:local/3");
  });

  it("never sends the token to another origin", async () => {
    await expect(saveProtectedFile("https://evil.example/steal", "x.pdf")).rejects.toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
