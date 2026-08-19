"use client";

import { Monitor, Moon, Sun } from "lucide-react";

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
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title={T.nav.theme} hint={T.nav.themeHint} padded>
        <div className="grid gap-2" role="radiogroup" aria-label={T.nav.theme}>
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
                  "flex items-center gap-3 rounded-(--radius-field) border px-3 py-2.5 text-start transition-colors",
                  active
                    ? "border-primary bg-primary-light text-primary-dark"
                    : "border-line bg-surface text-ink hover:bg-subtle"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="text-sm font-medium">{themeLabel(option.id)}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={T.nav.language} hint={T.nav.languageHint} padded>
        <div className="grid gap-2" role="radiogroup" aria-label={T.nav.language}>
          <button
            type="button"
            role="radio"
            lang="ar"
            aria-checked={locale === "ar"}
            onClick={() => setLocale("ar")}
            className={cn(
              "rounded-(--radius-field) border px-3 py-2.5 text-start transition-colors",
              locale === "ar"
                ? "border-primary bg-primary-light text-primary-dark"
                : "border-line bg-surface text-ink hover:bg-subtle"
            )}
          >
            <span className="block text-sm font-medium">العربية</span>
            <span className="mt-0.5 block text-[12px] font-normal text-muted">Arabic</span>
          </button>
          <button
            type="button"
            role="radio"
            lang="en"
            aria-checked={locale === "en"}
            onClick={() => setLocale("en")}
            className={cn(
              "rounded-(--radius-field) border px-3 py-2.5 text-start transition-colors",
              locale === "en"
                ? "border-primary bg-primary-light text-primary-dark"
                : "border-line bg-surface text-ink hover:bg-subtle"
            )}
          >
            <span className="block text-sm font-medium">English</span>
            <span className="mt-0.5 block text-[12px] font-normal text-muted">الإنجليزية</span>
          </button>
        </div>
      </Section>
    </div>
  );
}
