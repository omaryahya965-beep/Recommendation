"use client";

import { AnalyticsWorkspace } from "@/components/dashboard/AnalyticsWorkspace";
import { useI18n } from "@/lib/i18n";

export default function DepartmentAnalyticsPage() {
  useI18n();
  return <AnalyticsWorkspace role="department_head" />;
}
