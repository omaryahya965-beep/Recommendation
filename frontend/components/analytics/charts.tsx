"use client";

import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatMonth, formatNumber } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";

/*
 * Chart primitives for the analytics dashboards.
 *
 * Marks follow one spec everywhere: thin bars (<= 14px) with a 4px rounded
 * data end and a square baseline, hairline solid grid, a 2px surface gap
 * between neighbouring bars, series colours from the validated --color-chart-*
 * tokens, and text that always wears text colours (never the series colour).
 * Every chart has a hover/focus readout and a table view, so no value is
 * reachable only by hovering.
 */

/**
 * "How is this calculated?" — the metric's definition on hover and focus,
 * and on tap (touch screens have no hover; BUG-24).
 */
export function DefinitionHint({ text }: { text: string }) {
  useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="group/hint relative inline-flex">
      <button
        type="button"
        aria-label={T.insights.howCalculated}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-ink focus-visible:bg-subtle"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute top-full z-30 mt-1 w-64 rounded-lg border border-line bg-elevated p-3 text-start text-[12px] font-medium leading-relaxed text-ink opacity-0 shadow-lg transition-opacity group-hover/hint:visible group-hover/hint:opacity-100 group-focus-within/hint:visible group-focus-within/hint:opacity-100 start-0",
          open && "visible opacity-100"
        )}
      >
        {text}
      </span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  suffix,
  note,
  definition,
  href,
  alert = false,
  testId,
}: {
  label: string;
  value: number;
  suffix?: string;
  note?: ReactNode;
  definition?: string;
  href?: string;
  /** A status reading (e.g. overdue): danger edge plus icon when non-zero. */
  alert?: boolean;
  testId?: string;
}) {
  const alerting = alert && value > 0;
  const labelContent = (
    <>
      {alerting ? <AlertTriangle className="size-3.5 text-danger" aria-hidden /> : null}
      {label}
    </>
  );
  const labelClass = "inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft";
  // A linked tile is a "stretched link": the label is the link and its
  // ::after covers the card, so the whole tile still opens the list while
  // the definition button sits beside it, not inside the <a> (BUG-24).
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        {href ? (
          <Link href={href} className={cn(labelClass, "outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']")}>
            {labelContent}
          </Link>
        ) : (
          <span className={labelClass}>{labelContent}</span>
        )}
        {definition ? (
          <span className="relative z-10">
            <DefinitionHint text={definition} />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-heading text-[1.75rem] font-semibold leading-none text-navy">
        <span dir="ltr">{formatNumber(value)}</span>
        {suffix ? <span className="ms-0.5 text-[15px] font-semibold text-ink-soft">{suffix}</span> : null}
      </p>
      {note ? <p className="mt-2 text-[12px] font-medium leading-snug text-ink-soft">{note}</p> : null}
    </>
  );
  const className = cn(
    "block rounded-xl border bg-surface p-4 transition-colors",
    alerting ? "border-s-4 border-line border-s-danger" : "border-line",
    href && "relative hover:border-primary/40 has-[a:focus-visible]:border-primary has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/20"
  );
  return (
    <div className={className} data-testid={testId}>
      {body}
    </div>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-2 w-full overflow-hidden rounded-full bg-chart-1-track"
    >
      <span className="block h-full rounded-full bg-chart-1" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  href?: string;
}

/** Horizontal bars, one series: compare magnitudes across categories. */
export function BarList({ rows, emptyLabel }: { rows: BarRow[]; emptyLabel?: string }) {
  useI18n();
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">{emptyLabel ?? T.insights.empty}</p>;
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const content = (
          <span className="grid grid-cols-[minmax(6.5rem,10rem)_1fr_2.75rem] items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{row.label}</span>
              {row.sublabel ? <span className="block truncate text-[11.5px] text-muted">{row.sublabel}</span> : null}
            </span>
            <span className="h-2.5 rounded-sm bg-subtle">
              <span
                className="block h-full rounded-e-[4px] bg-chart-1"
                style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value ? 4 : 0 }}
              />
            </span>
            <span className="text-end text-[13px] font-semibold text-navy" dir="ltr">
              {formatNumber(row.value)}
            </span>
          </span>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="block rounded-lg hover:bg-subtle focus-visible:bg-subtle"
                aria-label={`${row.label}: ${row.value}`}
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

function niceMax(value: number): { max: number; ticks: number[] } {
  if (value <= 4) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const step = Math.pow(10, Math.floor(Math.log10(value / 4)));
  const nice = [1, 2, 2.5, 5, 10].map((multiple) => multiple * step).find((candidate) => candidate * 4 >= value) ?? step * 10;
  return { max: nice * 4, ticks: [0, 1, 2, 3, 4].map((index) => index * nice) };
}

export interface ColumnSeries {
  name: string;
  /** Tailwind background class from the chart tokens. */
  colorClass: string;
}

/**
 * Grouped columns over months (one group per month, up to two series). The
 * whole group is the hover/focus target; its readout lists every series.
 */
export function ColumnChart({
  data,
  series,
  label,
}: {
  data: Array<{ key: string; values: number[] }>;
  series: ColumnSeries[];
  label: string;
}) {
  useI18n();
  const [active, setActive] = useState<string | null>(null);
  // Months before the first activity are empty space: start at the first
  // month with data (keeping at least three) so the columns start where the
  // reader starts and fill the chart.
  const firstUsed = data.findIndex((point) => point.values.some((value) => value > 0));
  const shown = firstUsed <= 0 ? data : data.slice(Math.max(0, Math.min(firstUsed, data.length - 3)));
  const { max, ticks } = niceMax(Math.max(0, ...shown.flatMap((point) => point.values)));
  const height = 184;

  return (
    <figure className="space-y-3" aria-label={label}>
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-4 text-[12.5px] font-medium text-ink-soft" aria-hidden>
          {series.map((item) => (
            <li key={item.name} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-[3px]", item.colorClass)} />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}

      {/* pt-2 keeps the top tick label inside the figure */}
      <div className="flex gap-2 pt-5">
        {/* y axis */}
        <div className="relative w-8 shrink-0" style={{ height }} aria-hidden>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute end-0 -translate-y-1/2 text-[11px] text-muted"
              style={{ bottom: `${(tick / max) * 100}%` }}
              dir="ltr"
            >
              {formatNumber(tick)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }} aria-hidden>
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute inset-x-0 border-t border-chart-grid"
                style={{ bottom: `${(tick / max) * 100}%` }}
              />
            ))}
          </div>
          {/* columns */}
          <div className="relative flex items-end" style={{ height }}>
            {shown.map((point) => {
              const readout = `${formatMonth(point.key, "long")}: ${series
                .map((item, index) => `${item.name} ${point.values[index] ?? 0}`)
                .join("، ")}`;
              const isActive = active === point.key;
              return (
                <button
                  key={point.key}
                  type="button"
                  aria-label={readout}
                  onPointerEnter={() => setActive(point.key)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(point.key)}
                  onBlur={() => setActive(null)}
                  className={cn(
                    "relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm outline-none",
                    isActive && "bg-subtle/70"
                  )}
                >
                  {series.map((item, index) => (
                    <span
                      key={item.name}
                      className={cn("relative w-full max-w-[22px] rounded-t-[4px]", item.colorClass)}
                      style={{
                        height: `${((point.values[index] ?? 0) / max) * 100}%`,
                        minHeight: point.values[index] ? 3 : 0,
                      }}
                    >
                      {/* The value on the column: readable without hovering. */}
                      {point.values[index] ? (
                        <span className="absolute bottom-full start-1/2 mb-0.5 -translate-x-1/2 text-[10.5px] font-semibold tabular-nums text-ink-soft rtl:translate-x-1/2" aria-hidden>
                          {point.values[index]}
                        </span>
                      ) : null}
                    </span>
                  ))}
                  {isActive ? (
                    <span
                      role="status"
                      className="pointer-events-none absolute bottom-full z-20 mb-2 min-w-36 rounded-lg border border-line bg-elevated p-2.5 text-start shadow-lg"
                    >
                      <span className="block text-[11.5px] font-semibold text-ink-soft">
                        {formatMonth(point.key, "long")}
                      </span>
                      {series.map((item, index) => (
                        <span key={item.name} className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
                          <span className={cn("h-0.5 w-3 rounded-full", item.colorClass)} />
                          <span className="font-bold text-ink" dir="ltr">
                            {point.values[index] ?? 0}
                          </span>
                          {item.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* x axis */}
          <div className="mt-1.5 flex" aria-hidden>
            {shown.map((point, index) => (
              <span
                key={point.key}
                className={cn(
                  "min-w-0 flex-1 truncate text-center text-[11px] text-ink-soft",
                  index % 2 === 1 && "max-sm:invisible"
                )}
              >
                {formatMonth(point.key)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="text-[12.5px]">
        <summary className="cursor-pointer font-semibold text-primary-dark">{T.insights.tableView}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[18rem] border-collapse text-start">
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th scope="col" className="py-1.5 text-start font-semibold">{T.insights.month}</th>
                {series.map((item) => (
                  <th key={item.name} scope="col" className="py-1.5 text-start font-semibold">{item.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.key} className="border-b border-line/60">
                  <td className="py-1.5 text-ink">{formatMonth(point.key, "long")}</td>
                  {series.map((item, index) => (
                    <td key={item.name} className="py-1.5 font-semibold text-ink" dir="ltr">
                      {point.values[index] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function Panel({
  title,
  hint,
  children,
  className,
  testId,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-5", className)} data-testid={testId}>
      <header className="mb-4">
        <h2 className="font-heading text-[15px] font-bold text-navy">{title}</h2>
        {hint ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}
