"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api } from "@/lib/api";
import { caseTitle } from "@/lib/finding";
import { T, useI18n } from "@/lib/i18n";
import type { Paginated, RecommendationListItem, Role } from "@/lib/types";

function searchBase(role: Role) {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/my-tasks";
  return "/council/recommendations";
}

export function MobileSearchOverlay({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
}) {
  useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  const handleClose = () => {
    setQ("");
    setDebounced("");
    onClose();
  };

  useFocusTrap(open, panelRef, handleClose, inputRef);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const numericId = useMemo(() => {
    const raw = debounced.replace(/^REC-?/i, "");
    return /^\d+$/.test(raw) ? Number(raw) : null;
  }, [debounced]);

  const { data } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () =>
      api<Paginated<RecommendationListItem>>(
        `/api/recommendations/?search=${encodeURIComponent(debounced)}&page_size=8`
      ),
    enabled: open && debounced.length >= 2 && numericId === null,
  });

  const { data: byId } = useQuery({
    queryKey: ["global-search-id", numericId],
    queryFn: () => api<RecommendationListItem>(`/api/recommendations/${numericId}/`),
    enabled: open && numericId !== null,
    retry: false,
  });

  const results = byId ? [byId] : (data?.results ?? []);
  const base = searchBase(role);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={T.nav.search}
        className="flex h-full min-h-0 flex-col bg-bg"
      >
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={T.nav.searchPlaceholder}
              className="h-12 w-full rounded-lg border border-line bg-surface py-2 ps-10 pe-3 text-base text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-label={T.nav.search}
            />
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex size-12 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle"
            aria-label={T.nav.close}
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {debounced.length >= 2 ? (
            results.length ? (
              <ul className="space-y-2">
                {results.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`${base}/${item.id}`}
                      onClick={handleClose}
                      className="block min-w-0 rounded-xl border border-line bg-surface p-4"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12px] font-medium text-primary-dark" dir="ltr">
                          REC-{String(item.id).padStart(4, "0")}
                        </span>
                        <StatusBadge status={item.status} />
                      </span>
                      <span className="mt-2 block text-[15px] font-medium leading-snug text-ink">
                        {caseTitle(item.text, 80)}
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-muted">
                        {role === "department_head"
                          ? item.responsible_employee || item.report_title
                          : `${item.department_name}${item.responsible_employee ? ` · ${item.responsible_employee}` : ""}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-10 text-center text-[15px] text-ink-soft">{T.empty.search}</p>
            )
          ) : (
            <p className="px-2 py-10 text-center text-[15px] text-ink-soft">{T.nav.searchPlaceholder}</p>
          )}
        </div>
      </div>
    </div>
  );
}
