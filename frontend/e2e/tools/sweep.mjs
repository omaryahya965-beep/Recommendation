// Visual review helper (not a test): every width x locale for a few pages.
// Prints sideways overflow per combination and saves screenshots.
//   node e2e/tools/sweep.mjs <user> <outDir> <path> [<path> ...]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [user, outDir, ...paths] = process.argv.slice(2);
const WIDTHS = [320, 360, 375, 390, 412, 430, 768, 834, 1024, 1280, 1440];
const API = "http://127.0.0.1:8100";
const WEB = "http://127.0.0.1:3100";
mkdirSync(outDir, { recursive: true });

const session = await (
  await fetch(`${API}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: "E2e@12345" }),
  })
).json();
const browser = await chromium.launch();
const rows = [];
for (const locale of ["ar", "en"]) {
  for (const width of WIDTHS) {
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport: { width, height: mobile ? 800 : 900 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
      locale,
    });
    const page = await context.newPage();
    await page.goto(`${WEB}/login`);
    await page.evaluate(
      ([value, lang]) => {
        localStorage.setItem("audit_tracker_auth", value);
        localStorage.setItem("audit_locale", lang);
      },
      [JSON.stringify(session), locale]
    );
    for (const path of paths) {
      await page.goto(`${WEB}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      // Compare with the requested width, not innerWidth: on a mobile viewport
      // too-wide content grows the layout viewport itself (innerWidth follows
      // it), so `scrollWidth - innerWidth` stays 0 while the page is zoomed out.
      // And <html>/<body> clip sideways overflow, so also count elements cut
      // off at the screen edge (outside any scrolling/clipping box of their own).
      const { overflow, cutOff } = await page.evaluate((requested) => {
        const vw = window.innerWidth;
        const insideOwnClip = (el) => {
          for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
            const style = getComputedStyle(p);
            if (style.overflowX !== "visible" || style.position === "fixed") return true;
          }
          return false;
        };
        let cut = 0;
        for (const el of document.querySelectorAll("body *")) {
          const box = el.getBoundingClientRect();
          if (box.width < 2 || box.height < 2 || (box.left >= -1 && box.right <= vw + 1)) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.position === "fixed") continue;
          if (el.closest("[aria-hidden=true], .sr-only") || insideOwnClip(el)) continue;
          cut += 1;
        }
        return { overflow: Math.max(document.documentElement.scrollWidth, vw) - requested, cutOff: cut };
      }, width);
      const name = `${locale}-${width}-${path.replace(/[^a-z0-9]+/gi, "_")}.png`;
      await page.screenshot({ path: `${outDir}/${name}` });
      rows.push({ locale, width, path, overflow, cutOff });
    }
    await context.close();
  }
}
await browser.close();
const bad = rows.filter((row) => row.overflow > 1 || row.cutOff > 0);
console.log(`${rows.length} combinations, ${bad.length} with sideways overflow or cut-off content`);
for (const row of bad) {
  console.log(`  ${row.locale} ${row.width}px ${row.path}: +${row.overflow}px, ${row.cutOff} element(s) cut off`);
}
