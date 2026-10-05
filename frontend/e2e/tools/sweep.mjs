// Visual review helper (not a test): every width x locale for a few pages.
// Prints sideways overflow per combination and saves screenshots.
//   node e2e/tools/sweep.mjs <user> <outDir> <path> [<path> ...]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [user, outDir, ...paths] = process.argv.slice(2);
const WIDTHS = [320, 360, 375, 390, 412, 430, 768, 1024];
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
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const name = `${locale}-${width}-${path.replace(/[^a-z0-9]+/gi, "_")}.png`;
      await page.screenshot({ path: `${outDir}/${name}` });
      rows.push({ locale, width, path, overflow });
    }
    await context.close();
  }
}
await browser.close();
const bad = rows.filter((row) => row.overflow > 1);
console.log(`${rows.length} combinations, ${bad.length} with sideways overflow`);
for (const row of bad) console.log(`  ${row.locale} ${row.width}px ${row.path}: +${row.overflow}px`);
