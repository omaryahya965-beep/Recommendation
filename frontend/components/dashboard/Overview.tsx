"use client";

import { useEffect, useState } from "react";

import { loadAuth } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return T.dashboard.greetingMorning;
  if (hour < 17) return T.dashboard.greetingAfternoon;
  return T.dashboard.greetingEvening;
}

/** Role workspace title first; greeting stays secondary so the four homes differ. */
export function CommandHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { locale } = useI18n();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const auth = loadAuth();
    // The profile lives in localStorage, which is unreadable during SSR, so it
    // has to be synced in after mount. Runs once and cannot cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(auth?.user.full_name_ar || auth?.user.username || null);
  }, []);

  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[12px] text-muted">
          {greeting()}
          {name ? <span>{locale === "ar" ? "، " : ", "}{name}</span> : null}
        </p>
        <h1 className="mt-0.5 font-heading text-[1.35rem] font-bold text-navy">{title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{subtitle ?? T.dashboard.subtitle}</p>
      </div>
    </header>
  );
}
