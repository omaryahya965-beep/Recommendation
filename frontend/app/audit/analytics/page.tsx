"use client";

import { AnalyticsWorkspace } from "@/components/dashboard/AnalyticsWorkspace";
import { useI18n } from "@/lib/i18n";

export default function AuditAnalyticsPage() {
  useI18n();
  return <AnalyticsWorkspace role="audit" />;
}
