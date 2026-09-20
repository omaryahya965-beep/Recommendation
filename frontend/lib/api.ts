"use client";

import { currentT } from "./i18n/messages";
import type { Role, User } from "./types";

function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) {
    throw new Error("NEXT_PUBLIC_API_URL must be set on Vercel");
  }
  return "http://127.0.0.1:8000";
}

const API_BASE = resolveApiBase();

const STORAGE_KEY = "audit_tracker_auth";

export interface AuthState {
  access: string;
  refresh: string;
  user: User;
}

export function loadAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function saveAuth(state: AuthState | null) {
  if (typeof window === "undefined") return;
  if (state === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Client-side validation or Cloudinary upload failure — not a dropped HTTP call. */
export class ClientError extends Error {}

/** Extracts a human-readable message from DRF error payloads. */
export function errorMessage(err: unknown): string {
  const T = currentT();
  if (err instanceof ClientError) return err.message;
  if (err instanceof ApiError) {
    const body = err.body as Record<string, unknown> | null;
    if (body) {
      if (typeof body.detail === "string") return body.detail;
      const parts: string[] = [];
      for (const [key, value] of Object.entries(body)) {
        if (Array.isArray(value)) parts.push(`${key}: ${value.join(T.common.listSep)}`);
        else if (typeof value === "string") parts.push(`${key}: ${value}`);
      }
      if (parts.length) return parts.join(" — ");
    }
    return T.common.httpError.replace("{status}", String(err.status));
  }
  const msg = err instanceof Error ? err.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return T.common.connectionErrorHint;
  }
  return T.common.connectionError;
}

async function tryRefresh(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth?.refresh) return null;
  const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: auth.refresh }),
  });
  if (!res.ok) {
    saveAuth(null);
    return null;
  }
  const data = (await res.json()) as { access: string; refresh?: string };
  saveAuth({ ...auth, access: data.access, refresh: data.refresh ?? auth.refresh });
  return data.access;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (options.formData) {
      body = options.formData;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    return fetch(`${API_BASE}${path}`, { method: options.method ?? "GET", headers, body });
  };

  let token = loadAuth()?.access ?? null;
  let res = await doFetch(token);

  if (res.status === 401 && token) {
    token = await tryRefresh();
    if (token) res = await doFetch(token);
    else if (typeof window !== "undefined") window.location.href = "/login";
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body, `API ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Fetch a file from an authenticated endpoint and hand it to the browser.
 *
 * A plain anchor cannot be used: the API authenticates with a Bearer header,
 * which a navigation request will not carry. This performs the authenticated
 * request (refreshing the token once, like `api`) and saves the response.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const doFetch = async (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let token = loadAuth()?.access ?? null;
  let res = await doFetch(token);
  if (res.status === 401 && token) {
    token = await tryRefresh();
    if (token) res = await doFetch(token);
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body, `API ${res.status}`);
  }

  // Prefer the filename the server chose, so exports are named consistently.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function login(username: string, password: string): Promise<AuthState> {
  const res = await fetch(`${API_BASE}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null), "login failed");
  const data = (await res.json()) as { access: string; refresh: string; user: User };
  const state: AuthState = { access: data.access, refresh: data.refresh, user: data.user };
  saveAuth(state);
  return state;
}

/**
 * Sign out.
 *
 * Clearing local storage alone leaves the refresh token valid for its full
 * lifetime, so a copy taken beforehand keeps working. Ask the server to
 * blacklist it first, then clear locally and navigate — and still clear
 * locally if that call fails, because a user who pressed "sign out" must
 * end up signed out regardless.
 */
export async function logout() {
  const refresh = loadAuth()?.refresh;
  if (refresh) {
    try {
      await api("/api/auth/logout/", { method: "POST", body: { refresh } });
    } catch {
      /* Revocation is best-effort; never block the user from leaving. */
    }
  }
  saveAuth(null);
  if (typeof window !== "undefined") window.location.href = "/login";
}

export const ROLE_HOME: Record<string, string> = {
  audit: "/audit/dashboard",
  department_head: "/department/dashboard",
  employee: "/employee/my-tasks",
  council: "/council/pending-approvals",
};

export const ROLE_PROFILE: Record<Role, string> = {
  audit: "/audit/profile",
  department_head: "/department/profile",
  employee: "/employee/profile",
  council: "/council/profile",
};
