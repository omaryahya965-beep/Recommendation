"use client";

import { messageFromErrorBody, type ApiErrorBody } from "./errors";
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

const ROLES: readonly Role[] = ["audit", "department_head", "employee", "council"];

/** A stored session the app can use, or false (corrupt, legacy, hand-edited). */
function isAuthState(value: unknown): value is AuthState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AuthState>;
  const user = state.user as Partial<User> | null | undefined;
  return (
    typeof state.access === "string" &&
    typeof state.refresh === "string" &&
    !!user &&
    typeof user === "object" &&
    typeof user.id === "number" &&
    ROLES.includes(user.role as Role)
  );
}

export function loadAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* handled below */
  }
  if (isAuthState(parsed)) return parsed;
  // Unusable session: drop it so every page treats the visitor as signed out.
  localStorage.removeItem(STORAGE_KEY);
  return null;
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

/**
 * A message in the user's language for any failure. API errors are
 * translated by their stable `code` (lib/errors); the server's English
 * `detail` never reaches an Arabic screen.
 */
export function errorMessage(err: unknown): string {
  const T = currentT();
  if (err instanceof ClientError) return err.message;
  if (err instanceof ApiError) {
    return messageFromErrorBody(err.body as ApiErrorBody | null, err.status);
  }
  const msg = err instanceof Error ? err.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return T.common.connectionErrorHint;
  }
  return T.common.connectionError;
}

/** The session is fine but could not be renewed right now (429/5xx/offline). */
export class SessionRenewError extends ClientError {}

/** Waits between refresh attempts when the server is busy or unreachable. */
const REFRESH_RETRY_DELAYS_MS = [1000, 3000];

let refreshInFlight: Promise<string | null> | null = null;

/** Window events for the app-wide session notice (components/shell/SessionNotice). */
export const SESSION_RENEW_FAILED = "raqeeb:session-renew-failed";
export const SESSION_RENEWED = "raqeeb:session-renewed";

function announce(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

/**
 * Exchange the refresh token for a new access token.
 *
 * Single-flight: every request that hits 401 at the same moment awaits the
 * same promise. With refresh rotation + blacklisting, parallel refreshes with
 * one token signed the user out (the first rotated it, the rest were refused).
 *
 * Resolves to the new access token, or null when the refresh token itself was
 * refused (400/401) — the only case that ends the session. Throttling, server
 * errors and a dead connection are retried, then reported, keeping the session.
 */
function tryRefresh(): Promise<string | null> {
  refreshInFlight ??= refreshWithRetry().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshWithRetry(): Promise<string | null> {
  for (let attempt = 0; ; attempt += 1) {
    const auth = loadAuth();
    if (!auth?.refresh) return null;
    let res: Response | null = null;
    try {
      res = await fetch(`${API_BASE}/api/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: auth.refresh }),
      });
    } catch {
      res = null;
    }
    if (res?.ok) {
      const data = (await res.json()) as { access: string; refresh?: string };
      saveAuth({ ...auth, access: data.access, refresh: data.refresh ?? auth.refresh });
      announce(SESSION_RENEWED);
      return data.access;
    }
    if (res && (res.status === 400 || res.status === 401)) {
      saveAuth(null);
      return null;
    }
    if (attempt >= REFRESH_RETRY_DELAYS_MS.length) {
      announce(SESSION_RENEW_FAILED);
      throw new SessionRenewError(currentT().common.sessionRenewFailed);
    }
    const retryAfter = Number(res?.headers.get("Retry-After"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10_000)
      : REFRESH_RETRY_DELAYS_MS[attempt];
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
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
    else if (typeof window !== "undefined") window.location.replace("/login");
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
 * GET an authenticated API resource that is not JSON (exports, evidence).
 *
 * A plain anchor cannot be used: the API authenticates with a Bearer header,
 * which a navigation request will not carry. The token is only ever attached
 * to this app's own API origin; storage redirects are followed by the
 * browser without it.
 */
async function authorizedGet(pathOrUrl: string): Promise<Response> {
  const target = new URL(pathOrUrl, `${API_BASE}/`);
  if (target.origin !== new URL(API_BASE).origin) {
    throw new ClientError(currentT().common.error);
  }
  const doFetch = (token: string | null) =>
    fetch(target.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });

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
  return res;
}

function filenameFromDisposition(res: Response): string | null {
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? null;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the save before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Fetch a file from an authenticated endpoint and save it. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await authorizedGet(path);
  // Prefer the filename the server chose, so exports are named consistently.
  saveBlob(await res.blob(), filenameFromDisposition(res) ?? fallbackName);
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

/** File types a browser tab can display; anything else is saved instead. */
const VIEWABLE_EXT = new Set(["pdf", "png", "jpg", "jpeg", "txt", "csv"]);

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

export function isViewableFile(name: string): boolean {
  return VIEWABLE_EXT.has(extensionOf(name));
}

async function protectedBlob(pathOrUrl: string, fileName: string): Promise<Blob> {
  const res = await authorizedGet(pathOrUrl);
  const blob = await res.blob();
  // Storage often answers application/octet-stream; type the blob by its
  // extension so the browser can display a PDF or image inline.
  const type = MIME_BY_EXT[extensionOf(fileName)];
  return type && blob.type !== type ? new Blob([blob], { type }) : blob;
}

/**
 * Open a protected file (evidence, attachments served by the API) in a new
 * tab. The tab is opened synchronously, inside the user's click, so popup
 * blockers allow it; the authenticated download then fills it with a local
 * object URL. Types a browser cannot display are saved instead.
 */
/**
 * Whether this browser can show the file in a tab. A PDF needs the built-in
 * viewer: without it (mobile browsers, viewer turned off) the tab stays blank
 * and the file is downloaded under the blob's UUID (BUG-14).
 */
function canShowInline(fileName: string): boolean {
  if (!isViewableFile(fileName)) return false;
  if (extensionOf(fileName) !== "pdf") return true;
  return typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;
}

export async function openProtectedFile(pathOrUrl: string, fileName: string): Promise<void> {
  if (!canShowInline(fileName)) {
    await saveProtectedFile(pathOrUrl, fileName);
    return;
  }
  const tab = window.open("", "_blank");
  try {
    const blob = await protectedBlob(pathOrUrl, fileName);
    const url = URL.createObjectURL(blob);
    if (tab && !tab.closed) {
      tab.location.href = url;
    } else {
      saveBlob(blob, fileName);
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Save a protected file under its original name. */
export async function saveProtectedFile(pathOrUrl: string, fileName: string): Promise<void> {
  saveBlob(await protectedBlob(pathOrUrl, fileName), fileName);
}

export type LoginFailure = "credentials" | "throttled" | "server" | "network";

/**
 * Why a sign-in failed. Only a 400/401 means wrong credentials; throttling,
 * server errors and a dead connection each need a different message, and
 * telling a user their password is wrong when the server is down sends them
 * to reset a password that was fine.
 */
export function classifyLoginError(err: unknown): { kind: LoginFailure; retryAfter: number | null } {
  if (err instanceof ApiError) {
    if (err.status === 400 || err.status === 401) return { kind: "credentials", retryAfter: null };
    if (err.status === 429) {
      const body = (err.body ?? {}) as { retry_after?: unknown; detail?: unknown };
      let seconds = Number(body.retry_after);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        const match = typeof body.detail === "string" ? /(\d+)/.exec(body.detail) : null;
        seconds = match ? Number(match[1]) : NaN;
      }
      return { kind: "throttled", retryAfter: Number.isFinite(seconds) && seconds > 0 ? seconds : null };
    }
    return { kind: "server", retryAfter: null };
  }
  return { kind: "network", retryAfter: null };
}

/**
 * Every page of a paginated endpoint, for small complete lists that a page
 * computes on (e.g. report counts by stage). Bounded by `maxPages` so a
 * runaway list can never loop forever.
 */
export async function fetchAllPages<T>(path: string, pageSize = 100, maxPages = 50): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await api<{ results: T[]; next: string | null }>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&page_size=${pageSize}`
    );
    items.push(...data.results);
    if (!data.next) break;
  }
  return items;
}

export async function login(username: string, password: string): Promise<AuthState> {
  const res = await fetch(`${API_BASE}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const retryAfter = Number(res.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) body.retry_after = retryAfter;
    throw new ApiError(res.status, body, "login failed");
  }
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
  if (typeof window !== "undefined") window.location.replace("/login");
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
