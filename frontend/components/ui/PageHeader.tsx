import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Array<{ href?: string; label: string }>;
  actions?: ReactNode;
  children?: never;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      {breadcrumbs?.length ? (
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-ink-soft">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <ChevronRight className="size-3.5 rtl:rotate-180 opacity-60" aria-hidden /> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-primary-dark transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-ink">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-1.5 h-6 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-heading text-[1.75rem] font-bold text-navy leading-tight tracking-tight">{title}</h1>
            {description ? <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-soft">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2.5 pb-1">{actions}</div> : null}
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={cn("font-heading text-[1.125rem] font-bold text-navy", className)}>{children}</h2>;
}
