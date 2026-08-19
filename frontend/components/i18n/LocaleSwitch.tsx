"use client";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale, T } = useI18n();

  return (
    <div
      className={cn("flex shrink-0 rounded-(--radius-btn) border border-line p-0.5 text-[11px] font-medium", className)}
      role="group"
      aria-label={T.nav.language}
    >
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "rounded-[6px] px-2 py-1",
          locale === "ar" ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle"
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
          "rounded-[6px] px-2 py-1",
          locale === "en" ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle"
        )}
        aria-pressed={locale === "en"}
        lang="en"
      >
        English
      </button>
    </div>
  );
}
