"use client";

import { RecommendationRegister } from "@/components/register/RecommendationRegister";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";

export default function EmployeeRecommendationsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.dashboard.myRecommendations} description={T.register.employeeHint} />
      <RecommendationRegister detailBase="/employee/my-tasks" mine />
    </div>
  );
}
