"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { useTheme, type ThemePreference } from "@/lib/theme";

const THEMES: Array<{ id: ThemePreference; icon: typeof Sun }> = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

function themeLabel(id: ThemePreference) {
  if (id === "light") return T.nav.themeLight;
  if (id === "dark") return T.nav.themeDark;
  return T.nav.themeSystem;
}

export function AppearanceSettings() {
  const { locale, setLocale } = useI18n();
  const { preference, setTheme } = useTheme();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {/* Theme preference */}
      <Section title={T.nav.theme} hint={T.nav.themeHint} padded className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="grid gap-3" role="radiogroup" aria-label={T.nav.theme}>
          {THEMES.map((option) => {
            const Icon = option.icon;
            const active = preference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex min-h-12 items-center justify-between rounded-xl border p-4 text-start shadow-sm",
                  active
                    ? "border-primary bg-primary/8 text-primary-dark font-bold ring-1 ring-primary/20"
                    : "border-line bg-surface text-ink hover:bg-subtle/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="size-5 shrink-0" />
                  <span className="text-[14px] font-bold">{themeLabel(option.id)}</span>
                </div>
                {active && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary-dark text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Language preference */}
      <Section title={T.nav.language} hint={T.nav.languageHint} padded className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="grid gap-3" role="radiogroup" aria-label={T.nav.language}>
          {/* Arabic option */}
          <button
            type="button"
            role="radio"
            lang="ar"
            aria-checked={locale === "ar"}
            onClick={() => setLocale("ar")}
            className={cn(
              "flex min-h-12 items-center justify-between rounded-xl border p-4 text-start shadow-sm",
              locale === "ar"
                ? "border-primary bg-primary/8 text-primary-dark font-bold ring-1 ring-primary/20"
                : "border-line bg-surface text-ink hover:bg-subtle/50"
            )}
          >
            <div>
              <span className="block text-[14px] font-bold">العربية</span>
              <span className="mt-0.5 block text-[11.5px] font-medium text-muted">Arabic</span>
            </div>
            {locale === "ar" && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary-dark text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>

          {/* English option */}
          <button
            type="button"
            role="radio"
            lang="en"
            aria-checked={locale === "en"}
            onClick={() => setLocale("en")}
            className={cn(
              "flex min-h-12 items-center justify-between rounded-xl border p-4 text-start shadow-sm",
              locale === "en"
                ? "border-primary bg-primary/8 text-primary-dark font-bold ring-1 ring-primary/20"
                : "border-line bg-surface text-ink hover:bg-subtle/50"
            )}
          >
            <div>
              <span className="block text-[14px] font-bold">English</span>
              <span className="mt-0.5 block text-[11.5px] font-medium text-muted">الإنجليزية</span>
            </div>
            {locale === "en" && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary-dark text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        </div>
      </Section>
    </div>
  );
}
