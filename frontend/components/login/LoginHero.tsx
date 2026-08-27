"use client";

import { BarChart3, ShieldCheck, Users } from "lucide-react";
import Image from "next/image";

import { CitySkyline } from "@/components/login/CitySkyline";
import { LoginToolbar } from "@/components/login/LoginToolbar";
import { RamallahMark } from "@/components/login/RamallahMark";
import { T, useI18n } from "@/lib/i18n";

const VALUES = [
  { icon: ShieldCheck, titleKey: "transparencyTitle", subKey: "transparencySub" },
  { icon: BarChart3, titleKey: "efficiencyTitle", subKey: "efficiencySub" },
  { icon: Users, titleKey: "responsibilityTitle", subKey: "responsibilitySub" },
] as const;

function HeroTitle({ className, dir }: { className?: string; dir?: "rtl" | "ltr" }) {
  return (
    <p className={className} dir={dir}>
      <span>{T.login.heroTitleLead} </span>
      <span className="relative inline-block">
        <span
          aria-hidden
          className="absolute inset-x-[6%] -top-1.5 h-[3px] bg-[#08B8B0]"
        />
        {T.login.heroTitleEmph}
      </span>
      <span> {T.login.heroTitleTail}</span>
    </p>
  );
}

export function LoginHero() {
  const { dir } = useI18n();

  return (
    <aside className="relative isolate h-[13.75rem] shrink-0 overflow-hidden sm:h-[16.25rem] lg:absolute lg:inset-0 lg:h-full">
      <Image
        src="/images/city-hall.png"
        alt={T.login.cityHallAlt}
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover object-[center_32%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgb(6_43_61/0.5)_0%,rgb(6_43_61/0.66)_42%,rgb(7_53_74/0.86)_100%)]"
      />
      <div aria-hidden className="absolute inset-0 bg-[#08B8B0]/10" />

      <div className="absolute inset-0 z-20 flex flex-col px-4 pb-7 pt-[max(0.7rem,env(safe-area-inset-top))] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <RamallahMark inverted size="sm" showTagline={false} className="min-w-0" />
          <LoginToolbar inverted />
        </div>
        <div dir={dir} className="mt-auto flex flex-col items-center px-2 text-center">
          <HeroTitle
            dir={dir}
            className="text-[1.4rem] font-bold leading-snug text-white sm:text-[1.6rem]"
          />
          <p className="mt-2 max-w-[22rem] text-[13px] font-medium leading-6 text-white/90">
            {T.login.heroSubtitle}
          </p>
        </div>
      </div>

      <div
        dir={dir}
        className="absolute inset-0 z-20 hidden flex-col px-10 pb-24 pt-8 lg:flex xl:px-14"
      >
        <div className="flex items-center gap-4" dir="ltr">
          <RamallahMark inverted size="sm" className="shrink-0" />
          <HeroTitle
            dir={dir}
            className="min-w-0 flex-1 text-center text-[2rem] font-bold leading-snug text-white xl:text-[2.15rem]"
          />
          <span className="invisible shrink-0" aria-hidden>
            <RamallahMark inverted size="sm" />
          </span>
        </div>

        <div className="mt-auto flex flex-col items-center gap-8 self-center text-center">
          <div className="flex max-w-[42rem] flex-col items-center gap-3">
            <p className="text-[1.35rem] font-medium leading-9 text-white">
              {T.login.heroSubtitle}
            </p>
            <p className="text-[1.15rem] font-normal leading-8 text-white/80">
              {T.login.heroSupporting}
            </p>
          </div>
          <ul className="flex items-start justify-center gap-14 xl:gap-[4.5rem]">
            {VALUES.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.titleKey} className="flex w-[10.5rem] flex-col items-center gap-3 text-center">
                  <span className="flex size-16 items-center justify-center rounded-full border border-[#08B8B0]/75">
                    <Icon className="size-7 text-[#08B8B0]" strokeWidth={1.6} aria-hidden />
                  </span>
                  <p className="text-[1.15rem] font-medium leading-7 text-white">
                    {T.login.values[item.titleKey]} {T.login.values[item.subKey]}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <CitySkyline className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 w-full lg:h-[7.25rem]" />
    </aside>
  );
}
