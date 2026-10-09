import type { ReactNode } from "react";

/*
 * The frame every role home shares: the hero (with its count cards), then a
 * work column and — from 1280px — a context rail of about a third. Cards keep
 * their natural height; one spacing scale throughout. Below 1280px the rail
 * follows the work column.
 */

/** The page: hero, then the columns, on the home's vertical rhythm. */
export function DashboardPage({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in min-w-0 space-y-5 md:space-y-6">{children}</div>;
}

/** The work column (what needs the user) and the context rail beside it. */
export function DashboardColumns({ main, aside }: { main: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,31%)]">
      <div className="min-w-0 space-y-5 md:space-y-6">{main}</div>
      {aside ? <div className="min-w-0 space-y-5 md:space-y-6">{aside}</div> : null}
    </div>
  );
}
