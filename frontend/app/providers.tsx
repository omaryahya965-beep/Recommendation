"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { LocaleBridge } from "@/lib/i18n";
import { GC_TIME } from "@/lib/queryPolicy";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Per-resource freshness lives in lib/queryPolicy.ts. Focus refetching is
  // opt-in there: some queries (AI analyses) are expensive to regenerate.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: GC_TIME, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <LocaleBridge>{children}</LocaleBridge>
    </QueryClientProvider>
  );
}
