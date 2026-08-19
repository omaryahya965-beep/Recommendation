"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

export function Card({
  title,
  children,
  actions,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  useI18n();
  return (
    <section
      className={cn(
        "rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)",
        padded && "p-4 md:p-5",
        className
      )}
    >
      {(title || actions) && (
        <header className={cn("mb-3 flex items-center justify-between gap-2", !padded && "px-4 pt-4 md:px-5 md:pt-5")}>
          {title ? (
            <h2 className="font-body text-base font-semibold text-ink">{title}</h2>
          ) : (
            <span />
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "border border-primary/40 bg-surface text-primary-dark hover:bg-primary-light",
  danger: "bg-danger-dark text-white hover:bg-danger",
  warn: "bg-warning-dark text-white hover:opacity-90",
  ghost: "border border-line bg-transparent text-ink hover:bg-subtle",
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
        "inline-flex items-center justify-center gap-1.5 rounded-(--radius-btn) px-4 py-2",
        "text-[0.9rem] font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
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
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[0.8125rem] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger-dark">{error}</span> : null}
    </label>
  );
}

const FIELD_CLASS =
  "w-full rounded-(--radius-field) border border-line bg-surface px-3 py-2 text-sm " +
  "text-ink outline-none transition-colors focus:border-primary focus:bg-elevated focus:ring-2 focus:ring-primary/20";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  useI18n();
  return <input {...props} className={cn(FIELD_CLASS, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  useI18n();
  return <textarea rows={3} {...props} className={cn(FIELD_CLASS, props.className)} />;
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
      className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger-dark"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button variant="ghost" className="border-danger/30 text-danger-dark" onClick={onRetry}>
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
      className="rounded-(--radius-field) border border-success/30 bg-success-light px-3 py-2 text-sm text-success-dark"
    >
      {message}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  useI18n();
  return (
    <p className="py-8 text-center text-sm text-ink-soft" role="status">
      {label ?? T.common.loading}
    </p>
  );
}

const CALLOUT_TONES = {
  info: "border-info/25 bg-info-light text-info-dark",
  primary: "border-primary/25 bg-primary-light text-primary-dark",
  warning: "border-warning/30 bg-warning-light text-warning-dark",
  danger: "border-danger/25 bg-danger-light text-danger-dark",
  success: "border-success/25 bg-success-light text-success-dark",
  ai: "border-ai/25 bg-ai-light text-ai-dark",
  neutral: "border-line bg-subtle text-ink-soft",
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
    <div className={cn("rounded-(--radius-field) border px-3 py-2.5 text-sm", CALLOUT_TONES[tone], className)}>
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
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
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink">{children}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Long-form record prose with a heading — audit working-paper style. */
export function ProseBlock({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  useI18n();
  return (
    <div className="border-s-2 border-line ps-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <div className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.9] text-ink">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
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
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <div
      className={cn("flex h-2 overflow-hidden rounded-full bg-subtle", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
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
    <div className={cn("flex items-center gap-2", className)}>
      <MeterBar value={pct} tone={tone} className="min-w-0 flex-1" label={label} />
      {showValue ? (
        <span className="w-8 shrink-0 text-end font-mono text-xs tabular-nums text-ink-soft" dir="ltr">
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

/** Horizontal scrollable tab bar. Roving arrow-key navigation, RTL-aware. */
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
  useI18n();
  const enabled = items.filter((item) => !item.disabled);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = enabled.findIndex((item) => item.id === value);
    if (index < 0) return;
    // RTL: ArrowLeft advances forward visually.
    const delta = event.key === "ArrowLeft" ? 1 : -1;
    const next = enabled[(index + delta + enabled.length) % enabled.length];
    onChange(next.id);
  };

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn("scrollbar-thin flex gap-1 overflow-x-auto border-b border-line", className)}
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
              "relative shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:text-muted/60",
              selected ? "text-primary-dark" : "text-ink-soft hover:text-ink",
              !item.disabled && !selected && "hover:bg-subtle"
            )}
          >
            <span className="flex items-center gap-1.5">
              {item.label}
              {typeof item.count === "number" && item.count > 0 ? (
                <span className="rounded-full bg-subtle px-1.5 font-mono text-[11px] text-ink-soft">{item.count}</span>
              ) : null}
              {item.active ? <span aria-hidden className="size-1.5 rounded-full bg-warning" /> : null}
            </span>
            {selected ? (
              <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
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
    <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-(--radius-field) border p-3 transition-colors",
              selected ? "border-primary bg-primary-light" : "border-line bg-surface hover:border-primary/40"
            )}
          >
            <span className="flex items-start gap-2.5">
              <input
                type="radio"
                name={name}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", selected ? "text-primary-dark" : "text-ink")}>
                  {option.label}
                </span>
                {option.hint ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{option.hint}</span>
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
    <div className={cn("flex items-start gap-3", disabled && "opacity-60")}>
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
          "relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed",
          checked ? "bg-primary-dark" : "bg-ink/20"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-[inset-inline-start]",
            checked ? "start-[22px]" : "start-0.5"
          )}
        />
      </button>
      {hideLabel ? null : (
        <span id={labelId} onClick={toggle} className={cn("text-start", !disabled && "cursor-pointer")}>
          <span className="block text-sm font-medium text-ink">{label}</span>
          {description ? <span className="mt-0.5 block text-xs text-ink-soft">{description}</span> : null}
        </span>
      )}
    </div>
  );
}
