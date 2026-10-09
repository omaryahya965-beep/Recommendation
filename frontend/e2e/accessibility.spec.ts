import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { findReport, firstRecommendationOf } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES, type UserKey } from "./support/env";
import { caseUrl, type RoleKey } from "./support/workspace";

/**
 * axe (WCAG 2.1 A/AA) on each role's main screens: no serious or critical
 * violations. axe-core ships with eslint-plugin-jsx-a11y; if it is ever not
 * installed the scan is skipped rather than failing for the wrong reason.
 */
const AXE = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const axePath = existsSync(AXE) ? AXE : null;

async function seriousViolations(page: Page) {
  await page.addScriptTag({ path: axePath! });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
    const result = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.impact}) at ${v.nodes[0]?.target.join(" ")}`);
  });
}

const SCREENS: Array<{ who: UserKey; role: RoleKey; home: string }> = [
  { who: "audit", role: "audit", home: "/audit/dashboard" },
  { who: "head", role: "department_head", home: "/department/dashboard" },
  { who: "employee", role: "employee", home: "/employee/my-tasks" },
  { who: "council", role: "council", home: "/council/pending-approvals" },
];

for (const { who, role, home } of SCREENS) {
  test(`${role}: home and a case have no serious accessibility violations`, async ({ page, request }) => {
    test.skip(!axePath, "axe-core is not installed");
    const rec = await firstRecommendationOf(request, who, FIXTURES.financeInProgress);
    await signIn(page, request, who);
    for (const path of [home, caseUrl(role, rec.id)]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });
}

test("audit: report page and profile have no serious accessibility violations", async ({ page, request }) => {
  test.skip(!axePath, "axe-core is not installed");
  const report = await findReport(request, "audit", FIXTURES.financeDraft);
  await signIn(page, request, "audit");
  for (const path of [`/audit/reports/${report.id}`, "/audit/reports", "/audit/profile"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await seriousViolations(page), path).toEqual([]);
  }
});
