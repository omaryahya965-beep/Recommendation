"use client";

import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { T, useI18n } from "@/lib/i18n";

/**
 * 404 page.
 *
 * Also reached when a user follows a link to a record they may not see:
 * the API returns 404 rather than 403 for out-of-scope rows, so that the
 * existence of another department's case is never confirmed.
 */
export default function NotFound() {
  useI18n();
  return (
    <ErrorScreen title={T.errors.notFoundTitle} description={T.errors.notFoundDescription} />
  );
}
