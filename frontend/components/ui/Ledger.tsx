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
    <div className={cn("scrollbar-thin overflow-x-auto bg-surface", framed && "rounded-(--radius-card) border border-line shadow-(--shadow-card)")}>
      <table className="w-full min-w-[720px] text-[0.8125rem]">
        <thead>
          <tr className="bg-subtle/80 text-start text-[11.5px] font-medium text-ink-soft">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-start text-[0.75rem] font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {!hasRows && empty ? (
        <p className="px-4 py-6 text-center text-sm text-ink-soft">{empty}</p>
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
    <td className={cn("px-3 py-2 align-middle", mono && "font-mono text-xs", className)}>
      {children}
    </td>
  );
}

export function RecordId({ id, prefix = "REC" }: { id: number; prefix?: string }) {
  return (
    <span className="font-mono text-xs font-medium text-primary-dark" dir="ltr">
      {recordCode(id, prefix)}
    </span>
  );
}
