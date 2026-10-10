"use client";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { useI18n } from "@/lib/i18n";

export default function EmployeeAnalyticsPage() {
  useI18n();
  return <AnalyticsDashboard role="employee" />;
}
