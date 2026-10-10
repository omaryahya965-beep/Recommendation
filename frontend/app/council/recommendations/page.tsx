"use client";

import { RecommendationRegister } from "@/components/register/RecommendationRegister";
import { RegisterHeader } from "@/components/register/RegisterHeader";
import { T, useI18n } from "@/lib/i18n";

export default function CouncilRecommendationsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <RegisterHeader title={T.nav.recommendations} description={T.register.subtitle} homeHref="/council/pending-approvals" />
      <RecommendationRegister detailBase="/council/recommendations" showDepartmentFilter />
    </div>
  );
}
