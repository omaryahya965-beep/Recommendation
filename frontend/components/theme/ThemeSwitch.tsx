"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { useTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ id: ThemePreference; icon: typeof Sun }> = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

export function ThemeSwitch({ className }: { className?: string }) {
  useI18n();
  const { preference, setTheme } = useTheme();

  const label = (id: ThemePreference) =>
    id === "light" ? T.nav.themeLight : id === "dark" ? T.nav.themeDark : T.nav.themeSystem;

  return (
    <div
      className={cn(
        "inline-flex min-h-10 shrink-0 rounded-(--radius-btn) border border-line bg-elevated p-0.5",
        className
      )}
      role="group"
      aria-label={T.nav.theme}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = preference === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            title={label(option.id)}
            aria-pressed={active}
            className={cn(
              "flex size-9 items-center justify-center rounded-[6px] transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              active ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle hover:text-ink"
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="sr-only">{label(option.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
