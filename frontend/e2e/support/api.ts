import { expect, type APIRequestContext } from "@playwright/test";

import { API_URL, PASSWORD, USERS, type UserKey } from "./env";

export interface Session {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    role: string;
    department: number | null;
    municipality: number | null;
    full_name_ar?: string;
  };
}

const sessionCache = new Map<string, Session>();

/** Signs in through the API (no UI). Cached per user for the worker's life. */
export async function apiLogin(request: APIRequestContext, who: UserKey): Promise<Session> {
  const username = USERS[who];
  const cached = sessionCache.get(username);
  if (cached) return cached;
  const res = await request.post(`${API_URL}/api/auth/login/`, {
    data: { username, password: PASSWORD },
  });
  expect(res.status(), `login ${username}`).toBe(200);
  const session = (await res.json()) as Session;
  sessionCache.set(username, session);
  return session;
}

export async function apiGet<T = unknown>(
  request: APIRequestContext,
  who: UserKey,
  path: string
): Promise<{ status: number; body: T }> {
  const session = await apiLogin(request, who);
  const res = await request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.access}` },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body: body as T };
}

export async function apiPost<T = unknown>(
  request: APIRequestContext,
  who: UserKey,
  path: string,
  data?: unknown
): Promise<{ status: number; body: T }> {
  const session = await apiLogin(request, who);
  const res = await request.post(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.access}` },
    data: data ?? {},
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body: body as T };
}

interface ReportRow {
  id: number;
  title: string;
}

interface RecommendationRow {
  id: number;
  report: number;
  status: string;
}

/** The report with this exact title as the given user sees it, or null. */
export async function tryFindReport(
  request: APIRequestContext,
  who: UserKey,
  title: string
): Promise<ReportRow | null> {
  const { body } = await apiGet<{ results: ReportRow[] }>(
    request,
    who,
    `/api/reports/?search=${encodeURIComponent(title)}&page_size=50`
  );
  return body.results?.find((row) => row.title === title) ?? null;
}

/** The report with this exact title as the given user sees it. */
export async function findReport(
  request: APIRequestContext,
  who: UserKey,
  title: string
): Promise<ReportRow> {
  const match = await tryFindReport(request, who, title);
  if (!match) throw new Error(`Report not found for ${who}: ${title}`);
  return match;
}

/** The first recommendation of a seeded report. */
export async function firstRecommendationOf(
  request: APIRequestContext,
  who: UserKey,
  reportTitle: string
): Promise<RecommendationRow> {
  const report = await findReport(request, "audit", reportTitle);
  const { body } = await apiGet<{ results: RecommendationRow[] }>(
    request,
    who,
    `/api/recommendations/?report=${report.id}&page_size=50`
  );
  const first = body.results[0];
  if (!first) throw new Error(`No recommendation visible to ${who} in ${reportTitle}`);
  return first;
}
