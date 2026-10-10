// Visual review helper (not a test): screenshot pages of the local E2E stack.
//
//   node e2e/tools/shot.mjs <user> <path> <out.png> [width] [height] [--full] [--en] [--click=<text>]
//
// Signs in through the API like the specs do, so it only ever talks to the
// isolated E2E backend on 127.0.0.1:8100.
import { chromium } from "@playwright/test";

const [user, path, out, width = "1440", height = "900", ...flags] = process.argv.slice(2);
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8100";
const WEB = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100";

const res = await fetch(`${API}/api/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: user, password: "E2e@12345" }),
});
const session = await res.json();
const mobile = Number(width) < 768;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: Number(width), height: Number(height) },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  locale: "ar",
  timezoneId: "Asia/Gaza",
});
const page = await context.newPage();
await page.goto(`${WEB}/login`);
await page.evaluate(
  ([value, english]) => {
    localStorage.setItem("audit_tracker_auth", value);
    if (english) localStorage.setItem("audit_locale", "en");
  },
  [JSON.stringify({ access: session.access, refresh: session.refresh, user: session.user }), flags.includes("--en")]
);
await page.goto(`${WEB}${path}`);
await page.waitForLoadState("networkidle");
for (const flag of flags.filter((item) => item.startsWith("--click="))) {
  await page.getByText(flag.slice("--click=".length), { exact: false }).first().click();
  await page.waitForLoadState("networkidle");
}
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: flags.includes("--full") });
await browser.close();
console.log(out);
