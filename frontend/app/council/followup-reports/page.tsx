"use client";

import { FollowUpList } from "@/components/FollowUpList";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";

export default function CouncilFollowUpsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.followup.title} description={T.followup.subtitle} />
      <FollowUpList />
    </div>
  );
}
