"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { Tabs } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";
import { notificationsCenter } from "@/lib/notifications";
import type { Role } from "@/lib/types";

type SettingsTab = "appearance" | "reminders";

function tabsFor(): Array<{ id: SettingsTab; label: string }> {
  return [
    { id: "appearance", label: T.nav.appearance },
    { id: "reminders", label: T.nav.reminders },
  ];
}

export function SettingsHub({ role }: { role: Role }) {
  useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabs = tabsFor();
  const requested = searchParams.get("tab");
  // The inbox has its own page now; old links to the settings tab land there.
  useEffect(() => {
    if (requested === "notifications") router.replace(notificationsCenter(role));
  }, [requested, role, router]);
  const current: SettingsTab = tabs.some((tab) => tab.id === requested)
    ? (requested as SettingsTab)
    : "appearance";

  return (
    <div className="space-y-6">
      <PageHeader title={T.nav.settings} description={T.nav.settingsHint} />

      <div className="border-b border-line pb-1">
        <Tabs
          items={tabs}
          value={current}
          onChange={(id) => {
            router.replace(id === "appearance" ? pathname : `${pathname}?tab=${id}`);
          }}
        />
      </div>

      <div className="mt-6">
        {current === "appearance" ? <AppearanceSettings /> : null}
        {current === "reminders" ? <ReminderSettings role={role} /> : null}
      </div>
    </div>
  );
}
