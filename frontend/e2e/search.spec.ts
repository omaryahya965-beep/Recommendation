import { expect, test } from "@playwright/test";

import { T } from "../lib/i18n/ar";
import { findReport, firstRecommendationOf } from "./support/api";
import { signIn } from "./support/auth";
import { FIXTURES } from "./support/env";

/** The global search: case and report references, and words from a report's title. */
test("global search finds a case by reference, a report's cases by RPT reference and by title", async ({ page, request }) => {
  const report = await findReport(request, "audit", FIXTURES.financeInProgress);
  const rec = await firstRecommendationOf(request, "audit", FIXTURES.financeInProgress);
  await signIn(page, request, "audit");
  await page.goto("/audit/dashboard");
  const box = page.getByRole("combobox", { name: T.nav.search });

  for (const query of [`REC-${String(rec.id).padStart(4, "0")}`, `RPT-${String(report.id).padStart(4, "0")}`, "قيد التنفيذ"]) {
    await box.fill(query);
    const hit = page.getByRole("listbox").locator(`a[href="/audit/recommendations/${rec.id}"]`).first();
    await expect(hit, query).toBeVisible();
  }

  await box.fill("لا-توجد-نتيجة-بهذا-النص");
  await expect(page.getByRole("listbox").locator(`a[href="/audit/recommendations/${rec.id}"]`)).toHaveCount(0);
});
