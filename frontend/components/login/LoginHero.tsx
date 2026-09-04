"use client";

import { BarChart3, ShieldCheck, Users } from "lucide-react";
import Image from "next/image";

import { LoginToolbar } from "@/components/login/LoginToolbar";
import { MunicipalityMark } from "@/components/login/MunicipalityMark";
import { T, useI18n } from "@/lib/i18n";

const TEAL = "#0F4F49";

/* Feature cards — RTL display order matches reference:
   ShieldCheck (right) | BarChart3 (center) | Users (left)  */
const FEATURE_CARDS = [
  {
    icon: ShieldCheck,
    titleKey: "transparencyTitle",
    subKey: "transparencySub",
    hintKey: "transparencyHint",
  },
  {
    icon: BarChart3,
    titleKey: "efficiencyTitle",
    subKey: "efficiencySub",
    hintKey: "efficiencyHint",
  },
  {
    icon: Users,
    titleKey: "responsibilityTitle",
    subKey: "responsibilitySub",
    hintKey: "responsibilityHint",
  },
] as const;

export function LoginHero() {
  const { dir } = useI18n();

  return (
    <aside
      aria-label={T.login.heroTitle}
      className="relative isolate flex h-[11rem] shrink-0 flex-col overflow-hidden bg-[#0F4F49] sm:h-[13.5rem] lg:absolute lg:inset-0 lg:h-full lg:w-full"
    >
      {/* ── Mobile: toolbar + branding overlay ── */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-5 lg:hidden">
        <MunicipalityMark
          inverted
          size="sm"
          showTagline={false}
          className="min-w-0"
        />
        <LoginToolbar inverted />
      </div>

      {/* ── Building photograph ── */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ height: "52%" }}
      >
        <Image
          src="/images/al-bireh-city-hall.jpg"
          alt={T.login.cityHallAlt}
          fill
          priority
          unoptimized
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[center_35%]"
        />
        {/* Top gradient — ensures badge is legible */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#062b3d]/50 to-transparent"
        />
        {/* Bottom subtle gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0F4F49]/80 to-transparent"
        />

        {/* ── Desktop municipality branding badge (top-left) ── */}
        <div className="absolute start-5 top-4 z-20 hidden lg:flex xl:start-7 xl:top-5">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md ring-1 ring-black/5">
            <MunicipalityMark size="sm" layout="horizontal" showTagline />
          </div>
        </div>
      </div>

      {/* ── Organic curved SVG transition (desktop only) ── */}
      <div
        aria-hidden
        className="-mt-14 relative z-10 hidden shrink-0 lg:block"
      >
        <svg
          viewBox="0 0 600 70"
          preserveAspectRatio="none"
          style={{ height: "70px", width: "100%", display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Smooth organic curve sweeping from left across center to right */}
          <path
            d="M 0,55 C 180,5 380,75 600,40 L 600,70 L 0,70 Z"
            fill={TEAL}
          />
          <path
            d="M 0,55 C 180,5 380,75 600,40"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* ── Teal information section (desktop only) ── */}
      <div
        dir={dir}
        className="relative z-10 hidden min-h-0 flex-1 flex-col items-center justify-between px-6 pb-6 pt-0 lg:flex xl:px-10 xl:pb-8"
        style={{ background: TEAL }}
      >
        {/* Platform branding copy */}
        <div className="flex flex-col items-center text-center">
          <h2 className="text-[1.5rem] font-extrabold leading-tight text-white xl:text-[1.75rem]">
            {T.login.heroTitle}
          </h2>
          <p className="mt-1.5 text-[0.9rem] font-medium leading-6 text-white/90 xl:text-[1rem]">
            {T.login.heroSubtitle}
          </p>
          <p className="mt-2 max-w-[32rem] text-center text-[0.8rem] font-normal leading-[1.65] text-white/65 xl:text-[0.85rem]">
            {T.login.heroSupporting}
          </p>
        </div>

        {/* Feature cards */}
        <ul className="mt-3 grid w-full max-w-[35rem] grid-cols-3 gap-3 xl:mt-4 xl:gap-3.5">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <li
                key={card.titleKey}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/[0.16] bg-white/[0.08] px-3 py-3 text-center transition-transform duration-200 hover:bg-white/[0.12] xl:py-3.5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-inner">
                  <Icon
                    className="size-5 text-white/95"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
                <p className="text-[0.82rem] font-bold leading-tight text-white xl:text-[0.86rem]">
                  {T.login.values[card.titleKey]}{" "}
                  {T.login.values[card.subKey]}
                </p>
                <p className="text-[0.7rem] leading-snug text-white/65 xl:text-[0.74rem]">
                  {T.login.values[card.hintKey]}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Mobile: simplified platform title overlay ── */}
      <div
        dir={dir}
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-4 pb-3 text-center lg:hidden"
      >
        <p className="text-[1.15rem] font-bold leading-tight text-white sm:text-[1.3rem]">
          {T.login.heroTitle}
        </p>
      </div>
    </aside>
  );
}
