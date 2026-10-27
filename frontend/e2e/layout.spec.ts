/**
 * Round 2, Part 1: tables and lists stay inside their card with any data.
 *
 * Hostile rows (unbroken 255/300-character titles, a 100,000-character finding,
 * long Arabic and mixed Arabic/Latin text) sit next to normal rows. At every
 * width and in both languages: no page overflow, no table wider than its card,
 * and at >= 1024 px every column visible, headers aligned with cells and no
 * cell wrapping past two lines. All assertions are on the DOM.
 */
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import type { UserKey } from "./support/env";
import { hostileRows } from "./support/hostile";

const WIDTHS = [1440, 1024, 768, 375] as const;
const PAGES: Array<[UserKey, string]> = [
  ["audit", "/audit/recommendations?ordering=-created_at"],
  ["head", "/department/recommendations?ordering=-created_at"],
  ["employee", "/employee/recommendations?ordering=-created_at"],
  ["council", "/council/recommendations?ordering=-created_at"],
  ["audit", "/audit/reports"],
  ["council", "/council/pending-approvals"],
  ["audit", "/audit/analytics"],
];

interface LayoutReport {
  pageOverflow: number;
  issues: string[];
  tables: number;
  fullTitles: string[];
}

async function inspectLayout(page: Page, strict: boolean): Promise<LayoutReport> {
  return page.evaluate((strictMode) => {
    const issues: string[] = [];
    const doc = document.documentElement;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    // An ancestor (up to `stop`) that clips overflow: text or boxes beyond it are not visible.
    const clipBox = (el: Element, stop: Element, includeSelf = false) => {
      let box: DOMRect | null = null;
      for (let p = includeSelf ? el : el.parentElement; p && p !== stop.parentElement; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const r = p.getBoundingClientRect();
          box = box
            ? new DOMRect(Math.max(box.left, r.left), Math.max(box.top, r.top),
                Math.min(box.right, r.right) - Math.max(box.left, r.left), Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top))
            : r;
        }
      }
      return box;
    };
    const lines = (el: Element) => {
      const tops: number[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        // The text's own element may be the one that clamps it.
        const clip = node.parentElement ? clipBox(node.parentElement, el, true) : null;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;
          // A line hidden by a clamp or ellipsis is not shown to anyone.
          if (clip && (rect.top >= clip.bottom - 1 || rect.bottom <= clip.top + 1)) continue;
          if (!tops.some((top) => Math.abs(top - rect.top) < 4)) tops.push(rect.top);
        }
      }
      return tops.length;
    };
    const tables = [...document.querySelectorAll("main table")].filter(visible);
    for (const table of tables) {
      const card = table.parentElement!;
      const tr = table.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      // Below 1024 px a table may scroll inside its own card; from 1024 px it must fit.
      const scrolls = ["auto", "scroll"].includes(getComputedStyle(card).overflowX);
      if (tr.width > cr.width + 1 && (strictMode || !scrolls)) {
        issues.push(`table ${Math.round(tr.width)}px wider than its card ${Math.round(cr.width)}px`);
      }
      if (!strictMode) continue;
      const heads = [...table.querySelectorAll("thead th")];
      const first = table.querySelector("tbody tr");
      heads.forEach((th, i) => {
        const r = th.getBoundingClientRect();
        if (r.width < 40) issues.push(`column "${th.textContent}" only ${Math.round(r.width)}px`);
        if (r.left < cr.left - 1 || r.right > cr.right + 1) issues.push(`column "${th.textContent}" outside its card`);
        const td = first?.children[i];
        if (td) {
          const d = td.getBoundingClientRect();
          if (Math.abs(d.left - r.left) > 1 || Math.abs(d.right - r.right) > 1) issues.push(`column "${th.textContent}" header not aligned with cells`);
        }
      });
      for (const row of table.querySelectorAll("tbody tr")) {
        for (const td of row.children) {
          const n = lines(td);
          if (n > 2) issues.push(`cell wraps to ${n} lines: "${(td.textContent ?? "").trim().slice(0, 40)}"`);
        }
      }
    }
    // Card lists: nothing may stick out of its card.
    for (const card of document.querySelectorAll("main li")) {
      if (!visible(card)) continue;
      const cr = card.getBoundingClientRect();
      for (const el of card.querySelectorAll("*")) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const clip = clipBox(el, card);
        if (clip && clip.left >= cr.left - 1 && clip.right <= cr.right + 1) continue;
        if (r.right > cr.right + 1 || r.left < cr.left - 1) {
          issues.push(`"${(el.textContent ?? "").trim().slice(0, 30)}" sticks out of its card`);
          break;
        }
      }
    }
    const fullTitles = [...document.querySelectorAll("main [title]")].map((el) => el.getAttribute("title") ?? "");
    return { pageOverflow: doc.scrollWidth - doc.clientWidth, issues: [...new Set(issues)].slice(0, 12), tables: tables.length, fullTitles };
  }, strict);
}

test.describe("tables and lists with hostile data", () => {
  test.beforeAll(() => {
    hostileRows();
  });

  for (const locale of ["ar", "en"] as const) {
    for (const width of WIDTHS) {
      test(`${locale} ${width}px: every list fits its card`, async ({ page, request }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ width, height: 900 });
        let signedInAs: UserKey | null = null;
        for (const [who, path] of PAGES) {
          if (signedInAs !== who) {
            await signIn(page, request, who);
            await page.evaluate((l) => localStorage.setItem("audit_locale", l), locale);
            signedInAs = who;
          }
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.locator("main").first().waitFor();
          const report = await inspectLayout(page, width >= 1024);
          expect(report.pageOverflow, `${path}: page overflow`).toBeLessThanOrEqual(1);
          expect(report.issues, `${path} at ${width}px ${locale}`).toEqual([]);
        }
      });
    }
  }

  test("the full hostile title is available on hover", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, request, "audit");
    await page.goto("/audit/recommendations?ordering=-created_at");
    await page.waitForLoadState("networkidle");
    const report = await inspectLayout(page, true);
    // The register's title is the case title the API sends (clipped to 90 characters).
    expect(report.fullTitles.some((title) => title.includes("w".repeat(80)))).toBe(true);
    await page.goto("/audit/reports");
    await page.waitForLoadState("networkidle");
    const reports = await inspectLayout(page, true);
    expect(reports.fullTitles.some((title) => title.includes("z".repeat(200)))).toBe(true);
  });
});
