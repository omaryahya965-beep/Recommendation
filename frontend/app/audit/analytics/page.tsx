"use client";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { useI18n } from "@/lib/i18n";

export default function AuditAnalyticsPage() {
  useI18n();
  return <AnalyticsDashboard role="audit" />;
}
