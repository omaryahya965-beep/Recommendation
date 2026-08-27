"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export function ExpandableSection({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  useI18n();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-start text-[14px] font-semibold text-primary-dark"
      >
        <span>{summary ?? T.common.details}</span>
        <ChevronDown className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="min-w-0 pb-1">{children}</div> : null}
    </div>
  );
}
