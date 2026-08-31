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
    <section className="relative overflow-hidden rounded-2xl border border-line bg-[#062b3d] min-h-[13.5rem] shadow-sm md:min-h-[19rem] lg:min-h-[21rem]">
      <Image
        src="/images/al-bireh-city-hall.jpg"
        alt={T.login.cityHallAlt}
        fill
        priority
        unoptimized
        sizes="100vw"
        className="object-cover object-[center_38%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-[#062b3d]/90 via-[#062b3d]/35 to-[#062b3d]/10"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#062b3d]/65 to-transparent md:h-24"
      />

      <div className="relative z-10 flex h-full min-h-[13.5rem] flex-col justify-end gap-2 px-3 py-4 md:min-h-[19rem] md:gap-5 md:px-10 md:py-10 lg:min-h-[21rem]">
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-3 md:inset-x-10 md:top-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
            <p className="text-[14px] font-medium text-white drop-shadow-md">
              {greeting()}
              {name ? <span>{locale === "ar" ? "، " : ", "}<span className="font-bold">{name}</span></span> : null}
            </p>
            <span className="rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold text-white ring-1 ring-white/30">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <p className="hidden shrink-0 rounded-full bg-[#062b3d]/55 px-3 py-1 text-[12px] font-semibold text-white shadow-sm ring-1 ring-white/25 md:block md:text-[13px]">
            {T.dashboard.placeCaption}
          </p>
        </div>

        <div className="max-w-4xl min-w-0">
          <h1 className="font-heading text-[1.375rem] font-bold leading-tight text-white drop-shadow-md md:text-[1.75rem]">
            {title}
          </h1>
          <p className="mt-1 hidden text-[14px] font-medium text-white/80 md:mt-2 md:block" dir={locale === "ar" ? "rtl" : "ltr"}>
            {formatLongDate()}
          </p>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-white/90 md:mt-3 md:text-[15px] md:leading-relaxed">{subtitle}</p>
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
                    "inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-center text-[11px] font-bold leading-tight sm:min-h-12 sm:w-auto sm:flex-row sm:gap-2.5 sm:px-5 sm:py-2.5 sm:text-[14px] transition-all duration-200 active:scale-95",
                    action.primary
                      ? "bg-white text-inverse hover:bg-white/90 shadow-md"
                      : "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md ring-1 ring-white/30"
                  )}
                >
                  <Icon className="size-4 shrink-0 sm:size-4.5" />
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
