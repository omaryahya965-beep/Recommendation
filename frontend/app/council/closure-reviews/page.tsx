"use client";

import { Gavel } from "lucide-react";
import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";

import { Callout, ErrorBanner } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { LoadMore } from "@/components/ui/LoadMore";
import { RecordId } from "@/components/ui/Ledger";
import { CaseDue } from "@/components/home/Queues";
import { PageHeader } from "@/components/ui/PageHeader";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { clipTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { usePagedList } from "@/lib/hooks";
import type { RecommendationListItem } from "@/lib/types";

export default function CouncilClosureReviewsPage() {
  useI18n();
  const list = usePagedList<RecommendationListItem>(
    ["recommendations", "pending-closure-council"],
    "/api/recommendations/?status=pending_closure_council&ordering=-priority_score"
  );
  const { items, isLoading, isError, refetch } = list;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={T.nav.closureReviews}
        description={T.council.closureSubtitle}
      />

      <Callout tone="neutral" icon={<Gavel className="size-4" />}>
        {T.council.closureHint}
      </Callout>

      {/* The title and guidance are static; only the list waits for data. */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : items.length ? (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/council/recommendations/${item.id}`}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface p-4 transition-all hover:border-primary/40 hover:shadow-(--shadow-card)"
              >
                <div className="min-w-0 flex-1">
                  <RecordId id={item.id} />
                  <p className="mt-1.5 font-medium leading-relaxed text-ink group-hover:text-primary-dark">
                    <bdi>{clipTitle(item.title, 120)}</bdi>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {item.department_name} · <bdi>{item.report_title}</bdi>
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <RiskBadge level={item.risk_level} />
                  <span className="text-xs text-ink-soft">
                    <span className="text-muted">{T.common.targetDate}: </span>
                    <span dir="ltr">{formatDate(item.target_date)}</span>
                  </span>
                  <CaseDue item={item} />
                  <DirForward className="size-4 text-muted" />
                </div>
              </Link>
            </li>
          ))}
          <li className="list-none">
            <LoadMore
              loaded={items.length}
              total={list.total}
              hasMore={Boolean(list.hasNextPage)}
              loading={list.isFetchingNextPage}
              onMore={() => list.fetchNextPage()}
            />
          </li>
        </ul>
      ) : (
        <EmptyState
          icon={<Gavel className="size-6" />}
          title={T.dashboard.nothingPending}
          description={T.council.emptyClosure}
        />
      )}
    </div>
  );
}
