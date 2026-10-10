"use client";

import { RecommendationRegister } from "@/components/register/RecommendationRegister";
import { RegisterHeader } from "@/components/register/RegisterHeader";
import { T, useI18n } from "@/lib/i18n";

export default function AuditRecommendationsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <RegisterHeader title={T.register.title} description={T.register.subtitle} homeHref="/audit/dashboard" />
      <RecommendationRegister
        detailBase="/audit/recommendations"
        showDepartmentFilter
      />
    </div>
  );
}
