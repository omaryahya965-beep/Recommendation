"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";
import { activeQueue, queueHint, queueTitle } from "@/lib/registerQueues";

interface Props {
  title: string;
  description?: string;
  /** The role's home page, first crumb when the list was opened from a queue. */
  homeHref: string;
}

/**
 * The register's page header. Opened from a home queue ("عرض المزيد"), it
 * says which queue it is showing and why its cases are there, with a crumb
 * back to the full register.
 */
export function RegisterHeader(props: Props) {
  return (
    <Suspense fallback={<PageHeader title={props.title} description={props.description} />}>
      <QueueAwareHeader {...props} />
    </Suspense>
  );
}

function QueueAwareHeader({ title, description, homeHref }: Props) {
  useI18n();
  const pathname = usePathname();
  const queue = activeQueue(useSearchParams());
  if (!queue) return <PageHeader title={title} description={description} />;
  return (
    <div data-testid="register-queue-header" data-queue={queue}>
      <PageHeader
        title={queueTitle(queue)}
        description={queueHint(queue)}
        breadcrumbs={[
          { href: homeHref, label: T.nav.dashboard },
          { href: pathname, label: title },
          { label: queueTitle(queue) },
        ]}
      />
    </div>
  );
}
