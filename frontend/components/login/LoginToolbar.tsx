"use client";

import { Moon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function LoginToolbar({ inverted = false }: { inverted?: boolean }) {
  const { locale, setLocale } = useI18n();
  const { resolved, setTheme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Theme/locale come from localStorage and are unreadable during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  const darkActive = ready && resolved === "dark";
  const englishActive = ready && locale === "en";
  const arabicActive = !ready || locale === "ar";
  const idle = inverted
    ? "font-normal text-white/75 hover:text-white"
    : "font-normal text-[var(--login-muted)] hover:text-[var(--login-text)]";
  const moonIdle = inverted
    ? "text-white/75 hover:text-white"
    : "text-[var(--login-muted)] hover:text-[var(--login-text)]";

  return (
    <div
      className="flex items-center gap-3"
      dir="rtl"
      role="toolbar"
      aria-label={T.nav.appearance}
    >
      <div className="flex items-center gap-2 text-[13px]" role="group" aria-label={T.nav.language}>
        <button
          type="button"
          onClick={() => setLocale("ar")}
          lang="ar"
          aria-pressed={arabicActive}
          className={cn("transition-colors", arabicActive ? "font-semibold text-[#08B8B0]" : idle)}
        >
          العربية
        </button>
        <span className={inverted ? "text-white/40" : "text-[var(--login-muted)]"} aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={() => setLocale("en")}
          lang="en"
          aria-pressed={englishActive}
          className={cn("transition-colors", englishActive ? "font-semibold text-[#08B8B0]" : idle)}
        >
          English
        </button>
      </div>
      <button
        type="button"
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        title={T.nav.themeDark}
        aria-label={T.nav.themeDark}
        aria-pressed={darkActive}
        className={cn(
          "flex size-8 items-center justify-center rounded-md transition-colors",
          darkActive ? "text-[#08B8B0]" : moonIdle
        )}
      >
        <Moon className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </button>
    </div>
  );
}

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export { MicrosoftLogo };
