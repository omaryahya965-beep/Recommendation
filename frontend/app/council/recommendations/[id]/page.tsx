"use client";

import { useI18n } from "@/lib/i18n";

import { useParams } from "next/navigation";

import { RecommendationWorkspace } from "@/components/workspace/RecommendationWorkspace";

export default function CouncilRecommendationDetail() {
  useI18n();
  const params = useParams<{ id: string }>();
  return <RecommendationWorkspace id={Number(params.id)} role="council" />;
}
