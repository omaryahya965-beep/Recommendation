"use client";

import { AIAuditAssistant } from "@/components/ai/AIAuditAssistant";
import { AIIntelligence } from "@/components/ai/AIIntelligence";
import { Callout } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";

export default function CouncilAssistantPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.ai.assistant} description={T.ai.assistantHint} />
      <Callout tone="neutral">{T.ai.dutyNote}</Callout>
      <AIIntelligence role="council" detailHref={(item) => `/council/recommendations/${item.id}`} />
      <AIAuditAssistant />
    </div>
  );
}
