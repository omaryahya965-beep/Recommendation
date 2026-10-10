"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Base";
import { T, useI18n } from "@/lib/i18n";

/** "Showing N of M" and a button for the next page; nothing is dropped silently. */
export function LoadMore({
  loaded,
  total,
  hasMore,
  loading,
  onMore,
}: {
  loaded: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  useI18n();
  if (!total) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-3" data-testid="load-more">
      <p className="text-[12.5px] text-muted">
        {T.common.showingOf.replace("{loaded}", String(loaded)).replace("{total}", String(total))}
      </p>
      {hasMore ? (
        <Button type="button" variant="secondary" onClick={onMore} disabled={loading} className="min-h-11 gap-2">
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {T.common.loadMore}
        </Button>
      ) : null}
    </div>
  );
}
