import type { ReactNode } from "react";
import Link from "next/link";

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
    <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-[12px] text-ink-soft">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden className="text-muted">/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-primary-dark hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-ink">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="font-heading text-[1.35rem] font-bold text-navy">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
  return <h2 className={cn("font-heading text-xl font-semibold text-navy", className)}>{children}</h2>;
}
