"use client";

import { RecommendationRegister } from "@/components/register/RecommendationRegister";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";

export default function CouncilRecommendationsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.nav.recommendations} description={T.register.subtitle} />
      <RecommendationRegister detailBase="/council/recommendations" showDepartmentFilter />
    </div>
  );
}
