import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { apiGet } from "./support/api";
import { signIn } from "./support/auth";

/**
 * Role homes (dashboard v2). Each block's count is the server's, and each
 * block opens the register with the same filter, so the list and the count
 * agree.
 */
interface Block {
  count: number;
}

async function registerCount(request: Parameters<typeof apiGet>[0], who: Parameters<typeof apiGet>[1], query: string) {
  const { body } = await apiGet<{ count: number }>(request, who, `/api/recommendations/?${query}`);
  return body.count;
}

test("the department head sees what is waiting on others, apart from its own delays", async ({ page, request }) => {
  const { body } = await apiGet<{ waiting_on_others: Block; due_soon: Block; team: unknown[] }>(
    request,
    "head",
    "/api/dashboard/"
  );
  expect(await registerCount(request, "head", "waiting_on=audit,council")).toBe(body.waiting_on_others.count);
  expect(await registerCount(request, "head", "due_within=7")).toBe(body.due_soon.count);

  await signIn(page, request, "head");
  await page.goto("/department/dashboard");
  await expect(page.getByTestId("waiting-on-others")).toBeVisible();
  await expect(page.getByTestId("home-team").getByRole("link")).toHaveCount(body.team.length);

  await page.goto("/department/recommendations?waiting_on=audit,council");
  await expect(
    page.getByRole("button", {
      name: T.register.chipWaitingOn.replace(
        "{who}",
        [T.workflow.waitingOn.audit, T.workflow.waitingOn.council].join(T.register.listSeparator)
      ),
    })
  ).toBeVisible();
});

test("the department head's count cards open the exact lists they count", async ({ page, request }) => {
  const { body } = await apiGet<{ action_center: Record<string, Block> }>(request, "head", "/api/dashboard/");
  const keys = ["responses_needed", "plans_needed", "implementations_to_review", "overdue"];

  await signIn(page, request, "head");
  await page.goto("/department/dashboard");
  const stats = page.getByTestId("home-stats").getByTestId("home-stat");
  await expect(stats).toHaveCount(keys.length);
  for (const [index, key] of keys.entries()) {
    const href = (await stats.nth(index).getAttribute("href")) ?? "";
    const query = href.split("?")[1] ?? "";
    expect(await registerCount(request, "head", query), key).toBe(body.action_center[key].count);
    await expect(stats.nth(index)).toContainText(String(body.action_center[key].count));
  }
  // The old sideways-scrolling metrics strip is gone.
  await expect(page.locator(".snap-scroll-x")).toHaveCount(0);
});

test("the employee lands on the next task with its binding deadline", async ({ page, request }) => {
  const { body } = await apiGet<{ active_tasks: Block & { items: Array<{ id: number }> }; task_facts: Record<string, unknown> }>(
    request,
    "employee",
    "/api/dashboard/"
  );
  expect(body.active_tasks.count).toBeGreaterThan(0);
  for (const item of body.active_tasks.items) expect(body.task_facts[String(item.id)]).toBeTruthy();

  await signIn(page, request, "employee");
  await page.goto("/employee/my-tasks");
  await expect(page.getByTestId("next-task").or(page.getByTestId("all-clear"))).toBeVisible();
  // Each task appears once, in its most urgent group, and every active task is listed.
  const rows = page.getByTestId("my-tasks").getByTestId("task-row");
  await expect(rows.first()).toBeVisible();
  const ids = await rows.evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-id"))));
  expect(new Set(ids).size).toBe(ids.length);
  for (const item of body.active_tasks.items) expect(ids).toContain(item.id);
});

test("the council sees its recent decisions", async ({ page, request }) => {
  const { body } = await apiGet<{ recent_decisions: Array<{ kind: string }> }>(request, "council", "/api/dashboard/");
  expect(body.recent_decisions.length).toBeGreaterThan(0);

  await signIn(page, request, "council");
  await page.goto("/council/pending-approvals");
  const feed = page.getByTestId("council-decisions");
  await expect(feed).toBeVisible();
  await expect(feed.getByText(T.home.decisionKinds.ratified).first()).toBeVisible();
  // The decision center leads with the two decision queues.
  await expect(page.getByTestId("council-ratify")).toBeVisible();
  await expect(page.getByTestId("council-closures")).toBeVisible();
});
