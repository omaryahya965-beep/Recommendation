"use client";

import { AlertTriangle, Home, RotateCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Base";
import { T, useI18n } from "@/lib/i18n";

/**
 * Full-page failure state.
 *
 * Users must never be shown a raw exception: the message here is written for
 * them, in their language, while the underlying error still reaches the
 * console and the platform logs for diagnosis. The digest is surfaced so a
 * user can quote it in a support request without it meaning anything on its
 * own.
 */
export function ErrorScreen({
  title,
  description,
  digest,
  onRetry,
  homeHref = "/",
}: {
  title: string;
  description: string;
  digest?: string;
  onRetry?: () => void;
  homeHref?: string;
}) {
  useI18n();
  return (
    <main
      role="alert"
      className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-5 px-4 py-12 text-center"
    >
      <span className="grid size-14 place-items-center rounded-full bg-danger-light text-danger-dark">
        <AlertTriangle className="size-7" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="font-heading text-xl font-bold text-navy sm:text-2xl">{title}</h1>
        <p className="text-[14px] leading-relaxed text-ink-soft">{description}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        {onRetry ? (
          <Button onClick={onRetry} className="min-h-11 w-full sm:w-auto">
            <RotateCw className="size-4" />
            {T.common.retry}
          </Button>
        ) : null}
        <Link href={homeHref} className="w-full sm:w-auto">
          <Button variant="secondary" className="min-h-11 w-full sm:w-auto">
            <Home className="size-4" />
            {T.common.backHome}
          </Button>
        </Link>
      </div>
      {digest ? (
        <p className="text-[11px] font-mono text-muted" dir="ltr">
          {digest}
        </p>
      ) : null}
    </main>
  );
}
