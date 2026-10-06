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

test("the employee lands on the next task with its binding deadline", async ({ page, request }) => {
  const { body } = await apiGet<{ active_tasks: Block }>(request, "employee", "/api/dashboard/");
  expect(body.active_tasks.count).toBeGreaterThan(0);

  await signIn(page, request, "employee");
  await page.goto("/employee/my-tasks");
  await expect(page.getByTestId("next-task").or(page.getByTestId("all-clear"))).toBeVisible();
  await expect(page.getByTestId("active-tasks").getByRole("link")).toHaveCount(Math.min(10, body.active_tasks.count));
});

test("the council sees its recent decisions", async ({ page, request }) => {
  const { body } = await apiGet<{ recent_decisions: Array<{ kind: string }> }>(request, "council", "/api/dashboard/");
  expect(body.recent_decisions.length).toBeGreaterThan(0);

  await signIn(page, request, "council");
  await page.goto("/council/pending-approvals");
  const feed = page.getByTestId("council-decisions");
  await expect(feed).toBeVisible();
  await expect(feed.getByText(T.home.decisionKinds.ratified).first()).toBeVisible();
});
