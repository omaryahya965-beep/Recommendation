"use client";

import Image from "next/image";

import { LoginToolbar } from "@/components/login/LoginToolbar";
import { MunicipalityMark } from "@/components/login/MunicipalityMark";
import { T, useI18n } from "@/lib/i18n";
import { FeatureCards } from "./FeatureCards";
import { ShieldCheck, BarChart3, Users } from "lucide-react";

export function LoginHero() {
  const { dir } = useI18n();

  return (
    <aside
      aria-label={T.login.heroTitle}
      className="relative isolate flex h-auto min-h-0 shrink-0 flex-col overflow-hidden lg:absolute lg:inset-0 lg:h-full lg:w-full transition-colors duration-250 ease-in-out"
      style={{ backgroundColor: "var(--login-hero-bg)" }}
    >


      {/* ── Building photograph (PART 3) ── */}
      <div
        className="relative shrink-0 overflow-hidden h-[38dvh] min-h-[18rem] w-full lg:flex-none lg:h-[48%]"
      >
        <Image
          src="/images/al-bireh-city-hall.jpg"
          alt={T.login.cityHallAlt}
          fill
          priority
          unoptimized
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[center_28%]"
        />
        
        {/* ── Mobile Static Text Layout (Inside Image) ── */}
        <div className="absolute inset-0 bg-black/20 lg:hidden pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 lg:hidden pointer-events-none" />
        
        <div className="absolute inset-0 z-20 flex flex-col justify-between pt-3 pb-4 px-4 lg:hidden">
          {/* Top: platform name sits in the former slogan slot */}
          <div className="flex flex-col items-center text-center mt-0">
            <h3
              className="invisible mb-1 text-[1.25rem] font-extrabold leading-tight select-none"
              aria-hidden
            >
              {T.login.heroTitle}
            </h3>
            <p
              className="text-[1.25rem] font-bold drop-shadow-md"
              style={{ color: "var(--login-hero-text-sub)" }}
            >
              {T.login.heroTitle}
            </p>
          </div>
          
          {/* Bottom: Description + Horizontal Features */}
          <div className="flex flex-col items-center text-center">
            <p 
              className="text-[0.7rem] font-normal leading-relaxed mb-4 max-w-[95%] drop-shadow-md"
              style={{ color: "var(--login-hero-text-muted)" }}
            >
              {T.login.heroSupporting}
            </p>
            
            <div className="flex flex-row justify-between items-center w-full">
              {[
                { icon: ShieldCheck, title: T.login.values.transparencyTitle },
                { icon: BarChart3, title: T.login.values.efficiencyTitle },
                { icon: Users, title: T.login.values.responsibilityTitle }
              ].map((feature, i) => (
                <div key={i} className={`flex-1 flex flex-col items-center justify-center gap-1.5 ${i !== 2 ? 'border-e border-white/20' : ''} px-1`}>
                  <feature.icon 
                    className="size-[1.1rem] drop-shadow-md" 
                    style={{ color: "var(--login-hero-text)" }}
                  />
                  <span 
                    className="text-[0.65rem] font-bold text-center leading-tight drop-shadow-md"
                    style={{ color: "var(--login-hero-text)" }}
                  >
                    {feature.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Top gradient — ensures badge legibility on desktop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 transition-colors duration-250 ease-in-out"
          style={{ background: "linear-gradient(to bottom, var(--login-hero-gradient), transparent)" }}
        />

        {/* ── Desktop municipality branding badge (top-left) ── */}
        <div className="absolute start-5 top-4 z-20 hidden lg:flex xl:start-7 xl:top-5">
          <div 
            className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 shadow-lg backdrop-blur-md transition-colors duration-250 ease-in-out"
            style={{ 
              backgroundColor: "var(--login-logo-bg)",
              boxShadow: "0 0 0 1px var(--login-logo-ring), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"
            }}
          >
            <MunicipalityMark size="sm" layout="horizontal" showTagline />
          </div>
        </div>
      </div>

      {/* ── Organic curved SVG transition (Desktop Only) ── */}
      <div
        aria-hidden
        className="-mt-8 sm:-mt-12 lg:-mt-20 relative z-10 shrink-0 pointer-events-none hidden lg:block"
      >
        <svg
          viewBox="0 0 600 100"
          preserveAspectRatio="none"
          style={{ height: "100px", width: "100%", display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Main teal wave fill */}
          <path
            d="M 0,45 C 200,100 400,10 600,55 L 600,100 L 0,100 Z"
            style={{ fill: "var(--login-hero-bg)", transition: "fill 250ms ease-in-out" }}
          />
          {/* Accent line along the curve boundary */}
          <path
            d="M 0,45 C 200,100 400,10 600,55"
            fill="none"
            stroke="var(--login-hero-icon-border)"
            strokeWidth="2"
            style={{ transition: "stroke 250ms ease-in-out" }}
          />
        </svg>
      </div>

      {/* ── Teal information section (Desktop Only) ── */}
      <div
        dir={dir}
        className="relative z-10 hidden lg:flex min-h-0 flex-1 flex-col items-center justify-between px-4 pb-6 pt-2 lg:px-6 lg:pb-4 xl:px-10 xl:pb-6 transition-colors duration-250 ease-in-out"
        style={{ backgroundColor: "var(--login-hero-bg)" }}
      >
        {/* Organic 3-Leaf Stem Watermark on bottom-left background */}
        <svg
          aria-hidden
          viewBox="0 0 160 160"
          className="pointer-events-none absolute start-3 bottom-6 size-44 opacity-[0.12] select-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 10,150 C 30,100 80,50 140,20"
            style={{ stroke: "var(--login-hero-text)", transition: "stroke 250ms ease-in-out" }}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M 140,20 C 110,35 90,65 110,85 C 130,65 145,45 140,20 Z"
            style={{ stroke: "var(--login-hero-text)", transition: "stroke 250ms ease-in-out" }}
            strokeWidth="1.8"
            fill="none"
          />
          <path
            d="M 75,85 C 45,75 30,95 45,115 C 65,105 75,95 75,85 Z"
            style={{ stroke: "var(--login-hero-text)", transition: "stroke 250ms ease-in-out" }}
            strokeWidth="1.8"
            fill="none"
          />
          <path
            d="M 40,120 C 15,120 10,140 25,150 C 40,145 45,135 40,120 Z"
            style={{ stroke: "var(--login-hero-text)", transition: "stroke 250ms ease-in-out" }}
            strokeWidth="1.8"
            fill="none"
          />
        </svg>

        {/* ── Platform branding copy (PART 1) ── */}
        <div className="relative z-10 flex w-full max-w-[42rem] flex-col items-center text-center transition-colors duration-250 ease-in-out">
          {/* 1. HERO TITLE: dominant heading (38-44px desktop, font 700-800, line-height 1.3) */}
          <h2 
            className="text-[clamp(1.4rem,2.5vw,2.4rem)] font-extrabold leading-[1.3] tracking-normal whitespace-nowrap transition-colors duration-250 ease-in-out"
            style={{ color: "var(--login-hero-text)" }}
          >
            {T.login.heroTitle}
          </h2>

          {/* 2. HERO SUBTITLE: secondary (20-23px, font 500-600, line-height 1.5, soft white, mt 10-14px) */}
          <p 
            className="mt-2 text-[clamp(0.9rem,1.1vw,1.2rem)] font-semibold leading-[1.5] transition-colors duration-250 ease-in-out"
            style={{ color: "var(--login-hero-text-sub)" }}
          >
            {T.login.heroSubtitle}
          </p>

          {/* 3. HERO DESCRIPTION: (15-17px, line-height 1.8-2, font 400, max-w 650px, mt 18-24px) */}
          <p 
            className="mt-3 max-w-[36rem] text-center text-[clamp(0.8rem,0.85vw,0.95rem)] font-normal leading-[1.8] transition-colors duration-250 ease-in-out"
            style={{ color: "var(--login-hero-text-muted)" }}
          >
            {T.login.heroSupporting}
          </p>
        </div>

        {/* ── Feature cards (all screens) ── */}
        <FeatureCards className="mt-8 lg:mt-10 xl:mt-12" />
      </div>

    </aside>
  );
}
