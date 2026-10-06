"use client";

import { RecommendationRegister } from "@/components/register/RecommendationRegister";
import { RegisterHeader } from "@/components/register/RegisterHeader";
import { T, useI18n } from "@/lib/i18n";

export default function EmployeeRecommendationsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <RegisterHeader title={T.dashboard.myRecommendations} description={T.register.employeeHint} homeHref="/employee/my-tasks" />
      <RecommendationRegister detailBase="/employee/my-tasks" mine />
    </div>
  );
}
