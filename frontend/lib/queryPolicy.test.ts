import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CASE, GC_TIME, LIVE, REFERENCE, invalidateRecommendationViews } from "./queryPolicy";

function seed(client: QueryClient, key: unknown[]) {
  client.setQueryData(key, { seeded: true });
}

function isStale(client: QueryClient, key: unknown[]) {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

describe("invalidateRecommendationViews", () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    for (const key of [
      ["recommendation", 1],
      ["recommendation", 2],
      ["recommendations", "all", "page=1"],
      ["dashboard"],
      ["analytics", "portfolio"],
      ["report", 10],
      ["report", 11],
      ["reports"],
      ["pending-approvals"],
      ["notifications", "unread"],
      ["departments"],
      ["employees"],
      ["workflow-policy-public"],
    ]) {
      seed(client, key);
    }
  });

  it("refreshes every view of case state after one case changes", () => {
    invalidateRecommendationViews(client, { id: 1, reportId: 10 });
    for (const key of [
      ["recommendation", 1],
      ["recommendations", "all", "page=1"],
      ["dashboard"],
      ["analytics", "portfolio"],
      ["report", 10],
      ["reports"],
      ["pending-approvals"],
      ["notifications", "unread"],
    ]) {
      expect(isStale(client, key), JSON.stringify(key)).toBe(true);
    }
  });

  it("leaves reference data and unrelated cases alone", () => {
    invalidateRecommendationViews(client, { id: 1, reportId: 10 });
    for (const key of [["recommendation", 2], ["report", 11], ["departments"], ["employees"], ["workflow-policy-public"]]) {
      expect(isStale(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("refreshes every case when a report-level action moves them all", () => {
    invalidateRecommendationViews(client, { reportId: 10, allCases: true });
    expect(isStale(client, ["recommendation", 1])).toBe(true);
    expect(isStale(client, ["recommendation", 2])).toBe(true);
    expect(isStale(client, ["departments"])).toBe(false);
  });
});

describe("freshness policy", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a revisited list from cache without refetching inside the window", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: GC_TIME } } });
    const queryFn = vi.fn().mockResolvedValue({ results: [] });
    const options = { queryKey: ["recommendations", "all", ""], queryFn, ...LIVE };

    const first = new QueryObserver(client, options);
    const off = first.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(10);
    off(); // navigate to a case
    await vi.advanceTimersByTimeAsync(40_000);

    const back = new QueryObserver(client, options);
    expect(back.getCurrentResult().data).toEqual({ results: [] }); // instant render
    const off2 = back.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(10);
    off2();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("bounds how long an open list can stay stale", () => {
    expect(LIVE.refetchInterval).toBeLessThanOrEqual(2 * 60_000);
    expect(CASE.staleTime).toBeLessThanOrEqual(60_000);
    expect(REFERENCE.staleTime).toBeGreaterThan(LIVE.staleTime);
  });
});
