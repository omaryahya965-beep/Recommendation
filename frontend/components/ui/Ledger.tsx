import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { recordCode } from "@/lib/format";

export function LedgerTable({
  headers,
  children,
  empty,
  framed = true,
}: {
  headers: string[];
  children: ReactNode;
  empty?: string;
  framed?: boolean;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className={cn("scrollbar-thin overflow-x-auto bg-surface", framed && "rounded-xl border border-line shadow-sm")}>
      <table className="w-full min-w-[760px] text-[13.5px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-subtle/95 backdrop-blur-sm border-b border-line text-start text-[11.5px] font-bold uppercase tracking-wider text-ink-soft shadow-sm">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-start">
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
    <td className={cn("px-4 py-3.5 align-middle group-hover:bg-subtle/30 transition-colors", mono && "font-mono text-[12.5px]", className)}>
      {children}
    </td>
  );
}

export function RecordId({ id, prefix = "REC" }: { id: number; prefix?: string }) {
  return (
    <span className="font-mono text-[12.5px] font-bold text-primary-dark tracking-wide bg-primary-light/50 px-1.5 py-0.5 rounded" dir="ltr">
      {recordCode(id, prefix)}
    </span>
  );
}
