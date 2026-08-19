import type { RecommendationListItem } from "@/lib/types";

export interface Workload {
  name: string;
  items: RecommendationListItem[];
  overdue: number;
  nearest: string | null;
}

/** Group in-flight recommendations by the assigned employee. */
export function buildWorkloads(items: RecommendationListItem[], unassigned: string): Workload[] {
  const byPerson = new Map<string, RecommendationListItem[]>();
  for (const item of items) {
    const key = item.responsible_employee ?? "";
    byPerson.set(key, [...(byPerson.get(key) ?? []), item]);
  }

  return Array.from(byPerson.entries())
    .map(([key, group]) => {
      const dates = group.map((item) => item.target_date).filter((date): date is string => Boolean(date));
      return {
        name: key || unassigned,
        items: group.sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999")),
        overdue: group.filter((item) => item.overdue).length,
        nearest: dates.length ? dates.sort()[0] : null,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.items.length - a.items.length);
}
