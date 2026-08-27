"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { Tabs } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

type SettingsTab = "appearance" | "notifications" | "reminders";

function tabsFor(): Array<{ id: SettingsTab; label: string }> {
  return [
    { id: "appearance", label: T.nav.appearance },
    { id: "notifications", label: T.nav.notifications },
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
        {current === "notifications" ? <NotificationCenter role={role} embedded /> : null}
        {current === "reminders" ? <ReminderSettings role={role} /> : null}
      </div>
    </div>
  );
}
