"use client";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale, T } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex min-h-10 shrink-0 rounded-(--radius-btn) border border-line bg-elevated p-0.5 text-[12px] font-medium",
        className
      )}
      role="group"
      aria-label={T.nav.language}
    >
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "min-h-9 min-w-[4.5rem] rounded-[6px] px-3 transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          locale === "ar" ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle hover:text-ink"
        )}
        aria-pressed={locale === "ar"}
        lang="ar"
      >
        العربية
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "min-h-9 min-w-[4.5rem] rounded-[6px] px-3 transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          locale === "en" ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle hover:text-ink"
        )}
        aria-pressed={locale === "en"}
        lang="en"
      >
        English
      </button>
    </div>
  );
}
