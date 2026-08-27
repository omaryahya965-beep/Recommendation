"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export function Card({
  title,
  children,
  actions,
  className = "",
  padded = true,
  accent = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
  accent?: boolean;
}) {
  useI18n();
  return (
    <section
      className={cn(
        "zone-panel relative overflow-hidden transition-shadow duration-200",
        padded && "p-5 md:p-6",
        className
      )}
    >
      {accent && (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary-dark" aria-hidden />
      )}
      {(title || actions) && (
        <header className={cn("mb-4 flex items-center justify-between gap-3 border-b border-line pb-4", !padded && "px-5 pt-5 md:px-6 md:pt-6")}>
          {title ? (
            <h2 className="font-heading text-base font-bold text-navy">{title}</h2>
          ) : (
            <span />
          )}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow-md",
  secondary: "bg-primary-light text-primary-dark hover:bg-primary/20",
  danger: "bg-danger-dark text-white shadow-sm hover:bg-danger hover:shadow-md",
  warn: "bg-warning-dark text-white shadow-sm hover:bg-warning hover:shadow-md",
  ghost: "bg-transparent text-ink-soft hover:bg-subtle hover:text-ink",
  ai: "border border-ai/30 bg-ai-light text-ai-dark hover:bg-ai/15",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ref,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  useI18n();
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5",
        "text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "min-h-12",
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  useI18n();
  return (
    <label className={cn("block group", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink group-focus-within:text-primary-dark transition-colors">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-medium text-danger-dark animate-fade-in">{error}</span> : null}
    </label>
  );
}

const FIELD_CLASS =
  "w-full min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base md:text-[14px] " +
  "text-ink outline-none transition-all duration-200 hover:border-muted/40 focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  useI18n();
  return <input {...props} className={cn(FIELD_CLASS, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  useI18n();
  return <textarea rows={3} {...props} className={cn(FIELD_CLASS, "resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  useI18n();
  return <select {...props} className={cn(FIELD_CLASS, props.className)} />;
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void;
}) {
  useI18n();
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border-s-4 border-danger bg-danger-light px-4 py-3 text-[13.5px] font-medium text-danger-dark animate-fade-in shadow-sm"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button variant="ghost" className="h-8 border border-danger/20 text-danger-dark hover:bg-danger/10 px-3 py-1" onClick={onRetry}>
          {T.common.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  useI18n();
  if (!message) return null;
  return (
    <div
      role="status"
      className="rounded-md border-s-4 border-success bg-success-light px-4 py-3 text-[13.5px] font-medium text-success-dark animate-fade-in shadow-sm"
    >
      {message}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3" role="status">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm font-medium text-ink-soft animate-pulse">
        {label ?? T.common.loading}
      </p>
    </div>
  );
}

const CALLOUT_TONES = {
  info: "border-info bg-info-light text-info-dark",
  primary: "border-primary bg-primary-light text-primary-dark",
  warning: "border-warning bg-warning-light text-warning-dark",
  danger: "border-danger bg-danger-light text-danger-dark",
  success: "border-success bg-success-light text-success-dark",
  ai: "border-ai bg-ai-light text-ai-dark",
  neutral: "border-muted/40 bg-subtle text-ink-soft",
} as const;

/** Short contextual note. Never used as the only carrier of meaning. */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  useI18n();
  return (
    <div className={cn("rounded-md border-s-4 px-4 py-3 text-[13.5px] shadow-sm", CALLOUT_TONES[tone], className)}>
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 shrink-0 opacity-80">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold leading-snug">{title}</p> : null}
          {children ? <div className={cn("leading-relaxed", title && "mt-1")}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Label/value pair for read-only record data. */
export function DataField({
  label,
  children,
  hint,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  useI18n();
  return (
    <div className={cn("min-w-0 group", className)}>
      <dt className="mb-1 text-[13px] font-bold text-muted">{label}</dt>
      <dd className="text-[14px] font-medium leading-relaxed text-ink group-hover:text-navy transition-colors">{children}</dd>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** Long-form record prose with a heading — audit working-paper style. */
export function ProseBlock({
  label,
  children,
  hint,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  useI18n();
  return (
    <div className={cn("rounded-md border border-line bg-surface p-4 shadow-sm relative overflow-hidden", className)}>
      <div className="absolute start-0 top-0 bottom-0 w-1 bg-line" aria-hidden />
      <p className="mb-2 text-[13px] font-bold text-muted">{label}</p>
      <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{children}</div>
      {hint ? <p className="mt-3 border-t border-line pt-2 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function MeterBar({
  value,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill = {
    primary: "bg-primary shadow-[0_0_8px_rgba(23,107,99,0.5)]",
    success: "bg-success shadow-[0_0_8px_rgba(33,132,90,0.5)]",
    warning: "bg-warning shadow-[0_0_8px_rgba(201,138,26,0.5)]",
    danger: "bg-danger shadow-[0_0_8px_rgba(201,75,75,0.5)]",
  }[tone];
  return (
    <div
      className={cn("flex h-2.5 overflow-hidden rounded-full bg-subtle ring-1 ring-inset ring-line shadow-inner", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-all duration-700 ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "primary",
  showValue = true,
  label,
  className,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  showValue?: boolean;
  label?: string;
  className?: string;
}) {
  useI18n();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <MeterBar value={pct} tone={tone} className="min-w-0 flex-1" label={label} />
      {showValue ? (
        <span className="w-9 shrink-0 text-end font-mono text-[13px] font-medium tabular-nums text-ink-soft" dir="ltr">
          {pct}%
        </span>
      ) : null}
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
  /** Marks the tab the workflow is currently waiting on. */
  active?: boolean;
}

function TabLabel({ item, selected }: { item: TabItem; selected: boolean }) {
  return (
    <span className="flex min-w-0 items-center justify-center gap-2">
      <span className="min-w-0 truncate">{item.label}</span>
      {typeof item.count === "number" && item.count > 0 ? (
        <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-bold", selected ? "bg-primary-light text-primary-dark" : "bg-line/50 text-ink-soft")}>{item.count}</span>
      ) : null}
      {item.active ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" /> : null}
    </span>
  );
}

/** Horizontal scrollable tab bar on desktop; expandable section list on mobile. */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { dir } = useI18n();
  const [open, setOpen] = useState(false);
  const enabled = items.filter((item) => !item.disabled);
  const current = items.find((item) => item.id === value) ?? items[0];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = enabled.findIndex((item) => item.id === value);
    if (index < 0) return;
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const delta = event.key === forward ? 1 : -1;
    const next = enabled[(index + delta + enabled.length) % enabled.length];
    onChange(next.id);
  };

  return (
    <>
      <div className={cn("md:hidden", className)}>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 text-start text-[14px] font-semibold text-navy"
        >
          {current ? <TabLabel item={current} selected /> : null}
          <ChevronDown className={cn("size-5 shrink-0", open && "rotate-180")} aria-hidden />
        </button>
        {open ? (
          <div role="listbox" className="mt-2 overflow-hidden rounded-lg border border-line bg-surface">
            {items.map((item) => {
              const selected = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={item.disabled}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center px-4 text-start text-[14px] font-semibold",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    selected ? "bg-primary-light text-primary-dark" : "text-ink hover:bg-subtle",
                  )}
                >
                  <TabLabel item={item} selected={selected} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className={cn("scrollbar-thin hidden gap-1.5 overflow-x-auto rounded-lg bg-subtle p-1.5 ring-1 ring-inset ring-line md:flex", className)}
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={selected}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative min-h-11 min-w-[100px] flex-1 shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-[13px] font-semibold transition-all duration-200",
                "disabled:cursor-not-allowed disabled:opacity-40",
                selected ? "bg-surface text-primary-dark shadow-sm ring-1 ring-line/50" : "text-ink-soft hover:text-ink hover:bg-surface/50"
              )}
            >
              <TabLabel item={item} selected={selected} />
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Mutually exclusive choice cards — used for workflow decisions. */
export function ChoiceCards<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T | null;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; hint?: string; tone?: keyof typeof CALLOUT_TONES }>;
}) {
  useI18n();
  return (
    <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "min-h-12 cursor-pointer rounded-lg border-2 p-4 transition-all duration-200",
              selected ? "border-primary bg-primary-light/40 shadow-sm" : "border-line bg-surface hover:border-primary/30 hover:bg-subtle/50"
            )}
          >
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name={name}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4.5 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className={cn("block text-[14px] font-bold", selected ? "text-primary-dark" : "text-ink")}>
                  {option.label}
                </span>
                {option.hint ? (
                  <span className={cn("mt-1 block text-[12.5px] leading-relaxed", selected ? "text-primary-dark/80" : "text-ink-soft")}>{option.hint}</span>
                ) : null}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  hideLabel = false,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  useI18n();
  const labelId = useId();
  const toggle = () => {
    if (!disabled) onCheckedChange(!checked);
  };
  return (
    <div className={cn("flex min-h-11 items-center gap-3", disabled && "opacity-60")}>
      <button
        type="button"
        role="switch"
        dir="ltr"
        aria-checked={checked}
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-all duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed",
          checked ? "bg-primary shadow-inner" : "bg-line"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1.5 size-4 rounded-full bg-white shadow-sm transition-[inset-inline-start] duration-300",
            checked ? "start-[1.75rem]" : "start-1.5"
          )}
        />
      </button>
      {hideLabel ? null : (
        <span id={labelId} onClick={toggle} className={cn("text-start", !disabled && "cursor-pointer")}>
          <span className="block text-[13px] font-semibold text-ink">{label}</span>
          {description ? <span className="mt-0.5 block text-[12px] text-ink-soft">{description}</span> : null}
        </span>
      )}
    </div>
  );
}
