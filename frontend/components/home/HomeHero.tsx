"use client";

import { ChevronLeft, ChevronRight, MapPin, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { useIsPhone } from "@/lib/useMediaQuery";
import { loadAuth } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

/** A headline count in the hero, opening the queue it counts. */
export interface HeroSummaryItem {
  label: string;
  href: string;
  tone?: "danger" | "warning" | "primary" | "success";
}

const SUMMARY_DOT: Record<NonNullable<HeroSummaryItem["tone"]>, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  primary: "bg-primary",
  success: "bg-success",
};

/** A phone summary card: a big number that opens the exact list it counts. */
export interface HeroStat {
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
  /** The tone while the count is above zero; an empty queue reads as success. */
  tone: "primary" | "danger";
}

const STAT_CARD: Record<HeroStat["tone"] | "success", string> = {
  primary: "bg-surface ring-line shadow-card",
  danger: "bg-danger-light/45 ring-danger/15",
  success: "bg-surface ring-line shadow-card",
};

const STAT_ICON: Record<HeroStat["tone"] | "success", string> = {
  primary: "bg-primary-light text-primary-dark",
  danger: "bg-danger-light text-danger-dark ring-1 ring-danger/15",
  success: "bg-success-light text-success-dark",
};

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
  summary,
  stats,
}: {
  role: Role;
  title: string;
  subtitle: string;
  actions: QuickAction[];
  /** The primary summary: what needs the user now, one link per count. */
  summary?: HeroSummaryItem[];
  /** Phones: the summary as count cards (falls back to `summary`). */
  stats?: HeroStat[];
}) {
  const { locale } = useI18n();
  const [name, setName] = useState<string | null>(null);
  const ChevronForward = locale === "ar" ? ChevronLeft : ChevronRight;

  // Pages mount after the session check (never in the static HTML), so this
  // is the real viewport on first render: each layout requests only its own
  // photo size.
  const phone = useIsPhone();

  useEffect(() => {
    const auth = loadAuth();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(auth?.user.full_name_ar || auth?.user.username || null);
  }, []);

  if (phone) {
    return (
      <div className="space-y-3" data-testid="home-hero-compact">
        <section className="relative isolate overflow-hidden rounded-[1.375rem] bg-[#062b3d] shadow-[0_10px_28px_rgb(6_43_61/0.22)]">
          <Image
            src="/images/al-bireh-hero.webp"
            alt=""
            aria-hidden
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            className="-z-10 object-cover object-[30%_35%]"
          />
          {/* Darkest behind the text (the foot and the reading edge), so the
              white type stays readable over the photo. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#062b3d] via-[#062b3d]/65 to-[#062b3d]/15"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-l from-[#062b3d]/85 via-[#062b3d]/35 to-transparent ltr:bg-gradient-to-r"
          />
          <div className="flex min-h-[12.5rem] flex-col justify-between gap-6 px-4 pb-4 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#062b3d]/55 px-2.5 py-1 text-[11.5px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{T.dashboard.placeCaption}</span>
              </span>
              <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-bold text-white ring-1 ring-white/35 backdrop-blur-sm">
                {ROLE_LABELS[role]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-white/85">
                {greeting()}
                {name ? (
                  <>
                    {locale === "ar" ? "، " : ", "}
                    <span className="font-bold text-white">{name}</span>
                  </>
                ) : null}
              </p>
              <h1 className="mt-0.5 font-heading text-[1.5rem] font-bold leading-tight text-white drop-shadow-sm">
                {title}
              </h1>
              <p className="mt-1 text-[12.5px] font-medium text-white/85">{formatLongDate()}</p>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-white/75">{subtitle}</p>
            </div>
          </div>
        </section>

        {stats?.length ? (
          <ul className="grid grid-cols-2 gap-3" data-testid="home-summary">
            {stats.map((stat) => {
              const Icon = stat.icon;
              const tone = stat.count ? stat.tone : "success";
              return (
                <li key={stat.label} className="min-w-0">
                  <Link
                    href={stat.href}
                    data-testid="home-stat"
                    className={cn(
                      "flex h-full min-h-[6.75rem] min-w-0 flex-col justify-between gap-2 rounded-2xl p-3.5 ring-1 transition-transform active:scale-[0.98]",
                      STAT_CARD[tone]
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className={cn("flex size-10 items-center justify-center rounded-full", STAT_ICON[tone])} aria-hidden>
                        <Icon className="size-5" />
                      </span>
                      <span className="flex size-7 items-center justify-center rounded-full bg-surface/80 text-ink-soft ring-1 ring-line/60" aria-hidden>
                        <ChevronForward className="size-4" />
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-heading text-[1.75rem] font-bold leading-none tabular-nums text-navy">
                        {stat.count}
                      </span>
                      <span className="mt-1.5 block text-[12.5px] font-bold leading-snug text-ink">{stat.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : summary?.length ? (
          <ul className="grid gap-2" data-testid="home-summary">
            {summary.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center gap-2.5 rounded-2xl bg-surface px-3.5 text-[13.5px] font-bold text-ink shadow-card ring-1 ring-line active:scale-[0.99]"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", SUMMARY_DOT[item.tone ?? "primary"])} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <ChevronForward className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {actions.length ? (
          <nav
            className={cn("grid gap-3", actions.length >= 3 ? "grid-cols-3" : actions.length === 2 ? "grid-cols-2" : "grid-cols-1")}
            aria-label={T.dashboard.quickActions}
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href + action.label}
                  href={action.href}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-2 rounded-2xl px-1.5 py-3 text-center text-[12.5px] font-bold leading-tight transition-transform active:scale-[0.97]",
                    actions.length === 1 ? "min-h-14 flex-row" : "min-h-[5.75rem] flex-col",
                    action.primary
                      ? "bg-[#0f4f49] text-white shadow-[0_6px_16px_rgb(15_79_73/0.25)] ring-1 ring-white/10"
                      : "bg-surface text-navy shadow-card ring-1 ring-line"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      action.primary ? "bg-white/15 text-white ring-1 ring-white/25" : "bg-primary-light text-primary-dark"
                    )}
                    aria-hidden
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 max-w-full break-words hyphens-auto">{action.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden section-elevated bg-[#062b3d] min-h-[15rem] md:min-h-[17rem] lg:min-h-[23rem]">
      {/* Wide banner photo covering the whole card (decorative). Tablets get a
          shorter banner (17rem) so the first queue shows above the fold. */}
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
      {/* Overlay strongest on the text side (right in Arabic, left in English),
          softer toward the other edge; darker on mobile so the white text
          stays readable. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-l from-[#062b3d]/90 via-[#062b3d]/55 to-[#062b3d]/10 ltr:bg-gradient-to-r max-md:via-[#062b3d]/60 max-md:to-[#062b3d]/35"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-[#062b3d]/55 via-transparent to-transparent"
      />

      <div className="relative z-10 flex h-full min-h-[15rem] flex-col justify-end gap-2 px-4 py-5 md:min-h-[17rem] md:gap-3 md:px-8 md:pb-7 md:pt-20 lg:min-h-[23rem] lg:gap-5 lg:px-10 lg:pb-10 lg:pt-24">
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
          {summary?.length ? (
            <ul className="mt-3 hidden flex-wrap gap-2 md:flex" data-testid="home-summary">
              {summary.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#062b3d]/45 px-3.5 text-[13px] font-bold text-white ring-1 ring-white/30 backdrop-blur-md transition-colors hover:bg-[#062b3d]/65"
                  >
                    <span className={cn("size-2 rounded-full", SUMMARY_DOT[item.tone ?? "primary"])} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
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
