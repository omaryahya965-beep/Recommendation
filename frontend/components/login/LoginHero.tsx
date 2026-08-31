"use client";

import { BarChart3, ShieldCheck, Users } from "lucide-react";
import Image from "next/image";

import { LoginToolbar } from "@/components/login/LoginToolbar";
import { MunicipalityMark } from "@/components/login/MunicipalityMark";
import { T, useI18n } from "@/lib/i18n";

const VALUES = [
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
    <aside className="relative isolate flex h-[10.5rem] shrink-0 flex-col overflow-hidden bg-[#062b3d] [@media(max-height:42rem)]:h-[8rem] sm:h-[12.5rem] lg:absolute lg:inset-0 lg:h-full">
      <header className="relative z-20 hidden shrink-0 items-center px-8 py-5 lg:flex xl:px-12">
        <MunicipalityMark inverted size="sm" />
        <p
          dir={dir}
          className="pointer-events-none absolute inset-x-8 text-center text-[1.85rem] font-bold leading-snug text-white xl:text-[2.1rem]"
        >
          {T.login.heroTitle}
        </p>
      </header>

      <div className="relative min-h-0 flex-1">
        <Image
          src="/images/al-bireh-city-hall.jpg"
          alt={T.login.cityHallAlt}
          fill
          priority
          unoptimized
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-center"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#062b3d] to-transparent lg:h-8"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-[#062b3d] via-[#062b3d]/55 to-transparent"
        />

        <div className="absolute inset-0 z-20 flex flex-col px-4 pb-5 pt-[max(0.7rem,env(safe-area-inset-top))] lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <MunicipalityMark inverted size="sm" showTagline={false} className="min-w-0" />
            <LoginToolbar inverted />
          </div>
          <div dir={dir} className="mt-auto flex flex-col items-center px-2 text-center">
            <p className="text-[1.4rem] font-bold leading-snug text-white sm:text-[1.6rem]">
              {T.login.heroTitle}
            </p>
            <p className="mt-2 max-w-[22rem] text-[13px] font-medium leading-6 text-white/90">
              {T.login.heroSubtitle}
            </p>
          </div>
        </div>
      </div>

      <div dir={dir} className="relative z-20 hidden shrink-0 flex-col items-center px-8 pb-8 pt-1 lg:flex xl:px-12 xl:pb-10">
        <p className="max-w-[38rem] text-center text-[1.2rem] font-medium leading-8 text-white xl:text-[1.3rem] xl:leading-9">
          {T.login.heroSubtitle}
        </p>
        <p className="mt-2.5 max-w-[36rem] text-center text-[0.98rem] font-normal leading-7 text-white/80 xl:text-[1.05rem]">
          {T.login.heroSupporting}
        </p>
        <ul className="mt-8 grid w-full grid-cols-3 gap-4 xl:mt-9 xl:gap-6">
          {VALUES.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.titleKey} className="flex flex-col items-center gap-2.5 text-center">
                <span className="flex size-14 items-center justify-center rounded-full border border-[#08B8B0]/80">
                  <Icon className="size-6 text-[#08B8B0]" strokeWidth={1.6} aria-hidden />
                </span>
                <p className="text-[0.95rem] font-semibold leading-6 text-white xl:text-[1.05rem]">
                  {T.login.values[item.titleKey]} {T.login.values[item.subKey]}
                </p>
                <p className="max-w-[12rem] text-[12px] font-medium leading-5 text-white/60 xl:text-[13px]">
                  {T.login.values[item.hintKey]}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
