"use client";

import { useI18n } from "@/lib/i18n";

import { SettingsHub } from "@/components/settings/SettingsHub";

export default function AuditSettingsPage() {
  useI18n();
  return <SettingsHub role="audit" />;
}
