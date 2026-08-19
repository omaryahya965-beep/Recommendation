"use client";

import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { loadAuth } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

export interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return T.dashboard.greetingMorning;
  if (hour < 17) return T.dashboard.greetingAfternoon;
  return T.dashboard.greetingEvening;
}

export function HomeHero({
  role,
  title,
  subtitle,
  actions,
}: {
  role: Role;
  title: string;
  subtitle: string;
  actions: QuickAction[];
}) {
  const { locale } = useI18n();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const auth = loadAuth();
    // Profile lives in localStorage, which is unreadable during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(auth?.user.full_name_ar || auth?.user.username || null);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-(--radius-card) border border-line min-h-[13.5rem] md:min-h-[15.5rem]">
      <Image
        src="/images/city-hall.png"
        alt={T.login.cityHallAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_32%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#183B4E]/92 via-[#183B4E]/55 to-[#183B4E]/20" />

      <div className="relative z-10 flex h-full min-h-[13.5rem] flex-col justify-end gap-4 px-4 py-5 md:min-h-[15.5rem] md:px-6 md:py-6">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-white/80">
              {greeting()}
              {name ? <span>{locale === "ar" ? "، " : ", "}{name}</span> : null}
            </p>
            <span className="rounded-full border border-white/30 bg-white/12 px-2.5 py-0.5 text-[11px] font-medium text-white">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-[1.75rem] font-semibold leading-[1.75] text-white! [text-shadow:0_1px_12px_rgba(15,32,40,0.55)] md:text-[2.05rem]">
            {title}
          </h1>
          <p className="mt-1 text-[13px] font-medium text-white/85" dir={locale === "ar" ? "rtl" : "ltr"}>
            {formatLongDate()}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">{subtitle}</p>
        </div>

        {actions.length ? (
          <div className="flex flex-wrap gap-2" aria-label={T.dashboard.quickActions}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href + action.label}
                  href={action.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-(--radius-btn) px-3.5 py-2 text-sm font-medium transition-colors",
                    action.primary
                      ? "bg-white text-navy hover:bg-white/90"
                      : "border border-white/35 bg-white/12 text-white hover:bg-white/20"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        <p className="text-[11px] text-white/65">{T.dashboard.placeCaption}</p>
      </div>
    </section>
  );
}
