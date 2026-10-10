"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { RecommendationWizard } from "@/components/recommendation/RecommendationWizard";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { useI18n } from "@/lib/i18n";

function NewRecommendation() {
  const presetReport = useSearchParams().get("report") ?? "";
  return <RecommendationWizard mode="create" presetReport={presetReport} />;
}

export default function NewRecommendationPage() {
  useI18n();
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <NewRecommendation />
    </Suspense>
  );
}
