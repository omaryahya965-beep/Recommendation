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
    <section className="relative overflow-hidden rounded-2xl border border-line min-h-[11.5rem] shadow-sm md:min-h-[18rem]">
      <Image
        src="/images/city-hall.png"
        alt={T.login.cityHallAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_30%]"
      />
      <div className="absolute inset-0" style={{background: "linear-gradient(to top, rgba(12,32,44,0.97) 0%, rgba(12,32,44,0.58) 55%, rgba(12,32,44,0.08) 100%)"}} />

      <div className="relative z-10 flex h-full min-h-[11.5rem] flex-col justify-end gap-2 px-3 py-4 md:min-h-[18rem] md:gap-5 md:px-10 md:py-10">
        <div className="max-w-4xl min-w-0">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <p className="text-[14px] font-medium text-white/90">
              {greeting()}
              {name ? <span>{locale === "ar" ? "، " : ", "}<span className="font-bold">{name}</span></span> : null}
            </p>
            <span className="rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold text-white ring-1 ring-white/30">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <h1 className="mt-2 font-heading text-[1.375rem] font-bold leading-tight text-white drop-shadow-md md:mt-3 md:text-[1.75rem]">
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

        <p className="absolute top-3 end-3 hidden text-[11px] font-medium text-white/50 md:top-6 md:end-6 md:block">{T.dashboard.placeCaption}</p>
      </div>
    </section>
  );
}
