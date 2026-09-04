import { ShieldCheck, BarChart3, Users } from "lucide-react";
import { T } from "@/lib/i18n";
import React from "react";

/* Feature cards — RTL display order matches reference:
   RIGHT: ShieldCheck (شفافية في الأداء)
   CENTER: BarChart3 (كفاءة في المتابعة)
   LEFT: Users (مسؤولية في التنفيذ) */
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

export function FeatureCards({ className = "" }: { className?: string }) {
  return (
    <ul className={`relative z-10 grid w-full max-w-[38rem] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 ${className}`}>
      {FEATURE_CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <li
            key={card.titleKey}
            className="group flex flex-col items-center gap-1.5 rounded-2xl p-4 text-center transition-all duration-200 sm:gap-2 lg:p-5 xl:p-6"
            style={{ 
              backgroundColor: "var(--login-hero-card)", 
              borderColor: "var(--login-hero-card-border)",
              borderWidth: "1px"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--login-hero-card-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--login-hero-card)')}
          >
            {/* Card Icon (28-34px) */}
            <span 
              className="flex size-10 shrink-0 items-center justify-center rounded-xl shadow-inner transition-colors duration-250 ease-in-out sm:size-12 sm:rounded-2xl"
              style={{
                backgroundColor: "var(--login-hero-icon-bg)",
                borderColor: "var(--login-hero-icon-border)",
                borderWidth: "1px"
              }}
            >
              <Icon
                className="size-5 transition-colors duration-250 ease-in-out sm:size-7"
                style={{ color: "var(--login-hero-text)" }}
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
            {/* Card Title (16-18px, font 600-700) */}
            <p 
              className="mt-1 text-[clamp(0.75rem,0.9vw,0.95rem)] font-bold leading-snug transition-colors duration-250 ease-in-out"
              style={{ color: "var(--login-hero-text)" }}
            >
              {T.login.values[card.titleKey]}{" "}
              {T.login.values[card.subKey]}
            </p>
            {/* Card Description (13-14px, line-height 1.6) */}
            <p 
              className="text-[clamp(0.65rem,0.7vw,0.8rem)] leading-[1.5] transition-colors duration-250 ease-in-out mt-1 sm:leading-[1.6]"
              style={{ color: "var(--login-hero-text-muted)" }}
            >
              {T.login.values[card.hintKey]}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
