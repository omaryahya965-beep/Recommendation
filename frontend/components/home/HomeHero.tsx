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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(auth?.user.full_name_ar || auth?.user.username || null);
  }, []);

  return (
    <section className="relative overflow-hidden section-elevated bg-[#062b3d] min-h-[15rem] md:min-h-[21rem] lg:min-h-[23rem]">
      {/* Wide banner photo covering the whole card (decorative). */}
      <Image
        src="/images/al-bireh-hero.webp"
        alt=""
        aria-hidden
        fill
        priority
        // The dashboard's LCP element. Mounted after hydration, so without an
        // explicit high priority it queues behind the web fonts the page uses.
        fetchPriority="high"
        sizes="(min-width: 1440px) 1376px, 100vw"
        className="object-cover object-[center_30%] md:object-center"
      />
      {/* RTL overlay: strongest on the right (text side), softer toward the left;
          darker on mobile so the white text stays readable. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-l from-[#062b3d]/90 via-[#062b3d]/55 to-[#062b3d]/10 max-md:via-[#062b3d]/60 max-md:to-[#062b3d]/35"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-[#062b3d]/55 via-transparent to-transparent"
      />

      <div className="relative z-10 flex h-full min-h-[15rem] flex-col justify-end gap-2 px-4 py-5 md:min-h-[21rem] md:gap-5 md:px-10 md:py-10 lg:min-h-[23rem]">
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3 md:inset-x-10 md:top-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
            <p className="text-[14px] font-medium text-white drop-shadow-md">
              {greeting()}
              {name ? <span>{locale === "ar" ? "، " : ", "}<span className="font-bold">{name}</span></span> : null}
            </p>
            <span className="rounded-full bg-white/25 px-3 py-1 text-[12px] font-bold text-white shadow-[0_0_12px_rgba(255,255,255,0.15)] ring-1 ring-white/40 backdrop-blur-md">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <p className="hidden shrink-0 rounded-full bg-[#062b3d]/55 px-3 py-1 text-[12px] font-semibold text-white shadow-sm ring-1 ring-white/25 md:block md:text-[13px]">
            {T.dashboard.placeCaption}
          </p>
        </div>

        <div className="max-w-4xl min-w-0 max-md:mb-4">
          <h1 className="max-md:absolute max-md:inset-x-4 max-md:top-[3.5rem] font-heading text-[1.375rem] font-bold leading-tight text-white drop-shadow-md md:text-[1.75rem]">
            {title}
          </h1>
          <p className="mt-1 hidden text-[14px] font-medium text-white/80 md:mt-2 md:block" dir={locale === "ar" ? "rtl" : "ltr"}>
            {formatLongDate()}
          </p>
          <p className="mt-1.5 hidden max-w-2xl text-[13px] md:block leading-snug text-white/90 md:mt-3 md:text-[15px] md:leading-relaxed">{subtitle}</p>
        </div>

        {actions.length ? (
          <div className="mt-1 grid min-w-0 grid-cols-3 gap-1.5 sm:flex sm:flex-row sm:flex-wrap sm:gap-3" aria-label={T.dashboard.quickActions}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href + action.label}
                  href={action.href}
                  className={cn(
                    "inline-flex min-h-9 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-[10px] font-bold leading-tight sm:min-h-12 sm:w-auto sm:flex-row sm:gap-2.5 sm:px-5 sm:py-2.5 sm:text-[14px] transition-all duration-200 active:scale-95",
                    action.primary
                      ? "bg-white text-inverse hover:bg-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
                      : "bg-white/15 text-white hover:bg-white/25 backdrop-blur-lg ring-1 ring-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
                  )}
                >
                  <Icon className="size-3.5 shrink-0 sm:size-4.5" />
                  <span className="min-w-0">{action.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
