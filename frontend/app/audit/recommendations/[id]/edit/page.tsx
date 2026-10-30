"use client";

import { Lock, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { RecommendationWizard } from "@/components/recommendation/RecommendationWizard";
import { Button, ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { ApiError } from "@/lib/api";
import { useRecommendation } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";

export default function EditDraftRecommendationPage() {
  useI18n();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const { data: rec, isLoading, isError, error, refetch } = useRecommendation(id);

  // A draft that does not exist (deleted, mistyped, outside scope): retrying
  // cannot help, so say so and lead back to the register (BUG-25).
  if (!validId || (error instanceof ApiError && (error.status === 403 || error.status === 404))) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden />}
        title={T.caseView.unavailableTitle}
        description={T.errors.notFoundDescription}
        actions={
          <Link href="/audit/recommendations">
            <Button variant="secondary">{T.nav.recommendations}</Button>
          </Link>
        }
      />
    );
  }
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
