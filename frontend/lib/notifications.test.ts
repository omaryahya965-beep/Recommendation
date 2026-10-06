import { describe, expect, it } from "vitest";

import { caseHref, sectionForStatus } from "./caseLinks";
import {
  filterNotifications,
  groupByTime,
  notificationHref,
  notificationsCenter,
  timeGroupOf,
} from "./notifications";
import { activeQueue, queueFilterKeys, queueHref } from "./registerQueues";
import type { AppNotification } from "./types";

function note(patch: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    recommendation: null,
    report: null,
    recommendation_text: null,
    department_name: null,
    report_title: null,
    status: null,
    risk_level: null,
    target_date: null,
    responsible_employee: null,
    overdue: false,
    type: "action_required",
    message: "رسالة",
    is_read: false,
    sent_at: "2026-10-06T09:00:00Z",
    ...patch,
  } as AppNotification;
}

describe("notification targets", () => {
  it("opens the case at the section where its work is now", () => {
    const at = (status: AppNotification["status"], type: AppNotification["type"] = "action_required") =>
      notificationHref(note({ recommendation: 7, status, type }), "audit");
    expect(at("audit_review")).toBe("/audit/recommendations/7?section=response");
    expect(at("action_plan_review")).toBe("/audit/recommendations/7?section=plan");
    expect(at("submitted_for_verification")).toBe("/audit/recommendations/7?section=evidence");
    expect(at("closure_review")).toBe("/audit/recommendations/7?section=verification");
    expect(at("pending_closure_council")).toBe("/audit/recommendations/7?section=verification");
    expect(at("pending_council")).toBe("/audit/recommendations/7?section=decisions");
    expect(at("returned_insufficient", "returned")).toBe("/audit/recommendations/7?section=verification");
  });

  it("uses each role's case route", () => {
    const item = note({ recommendation: 9, status: "in_progress", type: "overdue" });
    expect(notificationHref(item, "employee")).toBe("/employee/my-tasks/9?section=plan");
    expect(notificationHref(item, "department_head")).toBe("/department/recommendations/9?section=plan");
    expect(notificationHref(note({ recommendation: 9, status: "pending_response", type: "response_needed" }), "department_head")).toBe(
      "/department/recommendations/9?section=finding"
    );
  });

  it("opens a report event at the report, or the role's list of that report", () => {
    const report = note({ report: 4, type: "response_needed" });
    expect(notificationHref(report, "audit")).toBe("/audit/reports/4");
    expect(notificationHref(report, "department_head")).toBe("/department/recommendations?report=4");
    expect(notificationHref(note({ report: 4, type: "action_required" }), "council")).toBe("/council/pending-approvals");
  });

  it("has an inbox page per role", () => {
    expect(notificationsCenter("audit")).toBe("/audit/notifications");
    expect(notificationsCenter("department_head")).toBe("/department/notifications");
  });

  it("maps every status to a section", () => {
    expect(sectionForStatus(null)).toBeNull();
    expect(caseHref("/audit/recommendations", 3, null)).toBe("/audit/recommendations/3");
  });
});

describe("inbox grouping and filters", () => {
  const now = new Date(2026, 9, 6, 15, 0);
  const today = note({ id: 1, sent_at: new Date(2026, 9, 6, 8, 0).toISOString() });
  const week = note({ id: 2, sent_at: new Date(2026, 9, 2, 8, 0).toISOString(), is_read: true });
  const older = note({ id: 3, sent_at: new Date(2026, 8, 1, 8, 0).toISOString(), type: "overdue" });

  it("groups by the day it arrived, newest first", () => {
    expect([timeGroupOf(today, now), timeGroupOf(week, now), timeGroupOf(older, now)]).toEqual(["today", "week", "older"]);
    expect(groupByTime([older, week, today], now).map((group) => [group.id, group.items.map((item) => item.id)])).toEqual([
      ["today", [1]],
      ["week", [2]],
      ["older", [3]],
    ]);
  });

  it("filters by read state, type and text", () => {
    const all = [today, week, older];
    expect(filterNotifications(all, "unread", "all", "").map((item) => item.id)).toEqual([1, 3]);
    expect(filterNotifications(all, "read", "all", "").map((item) => item.id)).toEqual([2]);
    expect(filterNotifications(all, "all", "overdue", "").map((item) => item.id)).toEqual([3]);
    expect(filterNotifications(all, "all", "all", "لا شيء")).toEqual([]);
  });
});

describe("register queues", () => {
  it("links to the exact subset and recognises it in the URL", () => {
    const href = queueHref("/audit/recommendations", "responses_to_review");
    expect(href).toBe("/audit/recommendations?queue=responses_to_review&status=audit_review&ordering=-waiting");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(activeQueue(params)).toBe("responses_to_review");
    // Changing one of its filters turns it back into a plain filtered list.
    params.set("status", "closed");
    expect(activeQueue(params)).toBeNull();
    expect(queueFilterKeys("high_risk_open")).toEqual(["risk_level", "open", "issued"]);
  });

  it("all review queues together are their four statuses", () => {
    const params = new URLSearchParams(queueHref("/audit/recommendations", "audit_priorities").split("?")[1]);
    expect(params.get("status__in")).toBe("audit_review,action_plan_review,submitted_for_verification,closure_review");
  });
});
