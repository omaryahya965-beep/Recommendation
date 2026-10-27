import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser suite. Starts its own isolated stack:
 *
 *   backend  config.settings.e2e on 127.0.0.1:8100, database `raqeeb_e2e` on
 *            the local test cluster (backend/scripts/start_test_db.ps1), reset
 *            and seeded by `manage.py e2e_reset`. Local AI only, no network.
 *   frontend a production build in .next-e2e with the E2E API baked in,
 *            served on 127.0.0.1:3100.
 *
 * Nothing here can reach Neon, Cloudinary or a paid AI provider.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
export const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
// Failure screenshots, traces and the HTML report are written outside the
// repository (override with E2E_ARTIFACTS_DIR). Tests assert on the DOM;
// no image baselines are kept in the repo.
const ARTIFACTS = process.env.E2E_ARTIFACTS_DIR ?? path.join(os.tmpdir(), "raqeeb-playwright");
const PYTHON =
  process.env.E2E_PYTHON ?? (process.platform === "win32" ? "venv\\Scripts\\python.exe" : "python");

export default defineConfig({
  testDir: "./e2e",
  // The suite shares one seeded database, so specs run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(ARTIFACTS, "test-results"),
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(ARTIFACTS, "playwright-report") }]],
  use: {
    baseURL: WEB_URL,
    locale: "ar",
    timezoneId: "Asia/Gaza",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\//,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      command: `${PYTHON} manage.py e2e_reset && ${PYTHON} manage.py runserver 127.0.0.1:${API_PORT} --noreload`,
      cwd: "../backend",
      url: `${API_URL}/api/health/`,
      env: {
        DJANGO_SETTINGS_MODULE: "config.settings.e2e",
        E2E_WEB_PORT: String(WEB_PORT),
        PYTHONUNBUFFERED: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npx next build && npx next start -H 127.0.0.1 -p ${WEB_PORT}`,
      url: `${WEB_URL}/login`,
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 420_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
