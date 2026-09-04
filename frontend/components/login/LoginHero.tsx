"use client";

import { BarChart3, ShieldCheck, Users } from "lucide-react";
import Image from "next/image";

import { LoginToolbar } from "@/components/login/LoginToolbar";
import { MunicipalityMark } from "@/components/login/MunicipalityMark";
import { T, useI18n } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────
   Brand color for the lower hero/info section.
   #0F4F49 = Dark Teal (matches design system primary-dark)
───────────────────────────────────────────────────────── */
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
      className="relative isolate flex h-[11rem] shrink-0 flex-col overflow-hidden bg-[#0F4F49] sm:h-[13.5rem] lg:absolute lg:inset-0 lg:h-full"
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
        style={{ height: "56%" }}
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
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#062b3d]/55 to-transparent"
        />
        {/* Bottom gradient — bridges into teal section */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-[#0F4F49] via-[#0F4F49]/50 to-transparent"
        />

        {/* ── Desktop municipality branding badge (top-start) ── */}
        <div className="absolute start-5 top-4 z-20 hidden lg:flex xl:start-7 xl:top-5">
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-md ring-1 ring-black/10">
            <MunicipalityMark size="sm" layout="horizontal" showTagline />
          </div>
        </div>
      </div>

      {/* ── Large organic curved SVG transition (desktop only) ── */}
      <div
        aria-hidden
        className="-mt-14 relative z-10 hidden shrink-0 lg:block"
      >
        <svg
          viewBox="0 0 600 68"
          preserveAspectRatio="none"
          style={{ height: "68px", width: "100%", display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Main teal arch — sweeps up from both sides to center peak */}
          <path d="M0,68 Q300,0 600,68 L600,68 L0,68 Z" fill={TEAL} />
          {/* Subtle white accent line following the arch */}
          <path
            d="M0,68 Q300,0 600,68"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* ── Teal information section (desktop only) ── */}
      <div
        dir={dir}
        className="relative z-10 hidden min-h-0 flex-1 flex-col items-center justify-between px-6 pb-6 pt-1 lg:flex xl:px-10 xl:pb-8"
        style={{ background: TEAL }}
      >
        {/* Platform branding copy */}
        <div className="flex flex-col items-center text-center">
          <h2 className="text-[1.45rem] font-bold leading-tight text-white xl:text-[1.65rem]">
            {T.login.heroTitle}
          </h2>
          <p className="mt-1.5 text-[0.88rem] font-medium leading-6 text-white/85 xl:text-[0.95rem]">
            {T.login.heroSubtitle}
          </p>
          <p className="mt-2 max-w-[32rem] text-center text-[0.8rem] font-normal leading-[1.7] text-white/60 xl:text-[0.85rem]">
            {T.login.heroSupporting}
          </p>
        </div>

        {/* Feature cards */}
        <ul className="mt-4 grid w-full grid-cols-3 gap-3 xl:mt-5 xl:gap-4">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <li
                key={card.titleKey}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.14] bg-white/[0.09] px-3 py-3.5 text-center xl:py-4"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/[0.22] bg-white/[0.1]">
                  <Icon
                    className="size-[1.1rem] text-white/90"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                </span>
                <p className="text-[0.8rem] font-semibold leading-snug text-white xl:text-[0.85rem]">
                  {T.login.values[card.titleKey]}{" "}
                  {T.login.values[card.subKey]}
                </p>
                <p className="max-w-[10rem] text-[0.7rem] leading-[1.55] text-white/60 xl:text-[0.75rem]">
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
