import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { recordCode } from "@/lib/format";

/**
 * A register table. With `widths` (one CSS width per header; leave the
 * flexible column `undefined`) it uses a fixed layout: column widths come from
 * the <colgroup>, never from the longest text in some row, so one row with a
 * long unbroken title cannot stretch its column and squeeze the others to one
 * word per line (round 2, Part 1). `minWidth` is the narrowest the table may
 * get; below it the table scrolls inside its own card, never the page.
 */
export function LedgerTable({
  headers,
  widths,
  minWidth = "760px",
  children,
  empty,
  framed = true,
}: {
  headers: string[];
  widths?: Array<string | undefined>;
  minWidth?: string;
  children: ReactNode;
  empty?: string;
  framed?: boolean;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className={cn("scrollbar-thin overflow-x-auto bg-surface", framed && "rounded-xl border border-line shadow-sm")}>
      <table className={cn("w-full text-[13.5px]", widths && "table-fixed")} style={{ minWidth }}>
        {widths ? (
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={width ? { width } : undefined} />
            ))}
          </colgroup>
        ) : null}
        <thead className="sticky top-0 z-10">
          <tr className="bg-subtle/95 backdrop-blur-sm border-b border-line text-start text-[11.5px] font-bold uppercase tracking-wider text-ink-soft shadow-sm">
            {headers.map((h) => (
              <th key={h} className="px-3 py-3 text-start align-bottom break-words">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {children}
        </tbody>
      </table>
      {!hasRows && empty ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <p className="text-[14px] text-ink-soft font-medium">{empty}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Text in a table cell: one line with an ellipsis (`lines={1}`) or at most two
 * (`lines={2}`), breaking even unbroken strings; the full text on hover.
 */
export function CellText({
  text,
  lines = 1,
  className,
  children,
}: {
  text: string;
  lines?: 1 | 2;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      title={text}
      className={cn(
        "block min-w-0 break-words",
        lines === 1 ? "truncate" : "line-clamp-2",
        className
      )}
    >
      {children ?? <bdi>{text}</bdi>}
    </span>
  );
}

export function LedgerCell({
  children,
  mono,
  className = "",
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td className={cn("min-w-0 px-3 py-3 align-middle break-words group-hover:bg-subtle/30 transition-colors", mono && "font-mono text-[12.5px]", className)}>
      {children}
    </td>
  );
}

export function RecordId({ id, prefix = "REC" }: { id: number; prefix?: string }) {
  return (
    <span className="font-mono text-[12.5px] font-bold whitespace-nowrap text-primary-dark tracking-wide bg-primary-light px-1.5 py-0.5 rounded" dir="ltr">
      {recordCode(id, prefix)}
    </span>
  );
}
