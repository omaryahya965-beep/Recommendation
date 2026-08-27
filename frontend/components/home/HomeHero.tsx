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
    <section className="relative overflow-hidden rounded-2xl border border-line min-h-[16rem] md:min-h-[18rem] shadow-sm">
      <Image
        src="/images/city-hall.png"
        alt={T.login.cityHallAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_30%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-navy/95 via-navy/60 to-navy/10" />

      <div className="relative z-10 flex h-full min-h-[16rem] flex-col justify-end gap-5 px-6 py-8 md:min-h-[18rem] md:px-10 md:py-10">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[14px] font-medium text-white/90">
              {greeting()}
              {name ? <span>{locale === "ar" ? "، " : ", "}<span className="font-bold">{name}</span></span> : null}
            </p>
            <span className="rounded-full bg-white/20 px-3 py-0.5 text-[11px] font-bold tracking-wider text-white backdrop-blur-md ring-1 ring-white/30">
              {ROLE_LABELS[role]}
            </span>
          </div>
          <h1 className="mt-3 font-heading text-[2rem] font-bold leading-tight text-white drop-shadow-md md:text-[2.5rem]">
            {title}
          </h1>
          <p className="mt-2 text-[14px] font-medium text-white/80" dir={locale === "ar" ? "rtl" : "ltr"}>
            {formatLongDate()}
          </p>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/90">{subtitle}</p>
        </div>

        {actions.length ? (
          <div className="mt-2 flex flex-wrap gap-3" aria-label={T.dashboard.quickActions}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href + action.label}
                  href={action.href}
                  className={cn(
                    "inline-flex items-center gap-2.5 rounded-lg px-5 py-2.5 text-[14px] font-bold transition-all duration-200 active:scale-95",
                    action.primary
                      ? "bg-white text-navy hover:bg-white/90 shadow-md"
                      : "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md ring-1 ring-white/30"
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        <p className="absolute top-6 end-6 text-[11px] font-medium text-white/50 tracking-wide uppercase">{T.dashboard.placeCaption}</p>
      </div>
    </section>
  );
}
