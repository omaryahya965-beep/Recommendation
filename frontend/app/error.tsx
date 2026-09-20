"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { T, useI18n } from "@/lib/i18n";

/**
 * Route-level error boundary.
 *
 * Without this, an exception in any page unmounts the tree and leaves the
 * user on a blank screen with no way back. Next.js catches it here instead
 * and offers a recovery path.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useI18n();

  useEffect(() => {
    // Keep the real error available for diagnosis; never render it.
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <ErrorScreen
      title={T.errors.title}
      description={T.errors.description}
      digest={error.digest}
      onRetry={reset}
    />
  );
}
