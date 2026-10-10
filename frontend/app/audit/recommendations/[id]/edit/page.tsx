"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { RecommendationWizard } from "@/components/recommendation/RecommendationWizard";
import { Button, ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { useRecommendation } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";

export default function EditDraftRecommendationPage() {
  useI18n();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: rec, isLoading, isError, refetch } = useRecommendation(id);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !rec) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  if (rec.status !== "draft") {
    return (
      <EmptyState
        icon={<Lock className="size-7" />}
        title={T.create.notEditable}
        actions={
          <Link href={`/audit/recommendations/${id}`}>
            <Button variant="secondary">{T.common.view}</Button>
          </Link>
        }
      />
    );
  }

  return <RecommendationWizard mode="edit" recommendation={rec} />;
}
