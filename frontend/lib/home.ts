import { daysUntil } from "@/lib/format";
import type { ActionCenterBlock, RecommendationListItem } from "@/lib/types";

export interface HomeSource {
  key: string;
  block: ActionCenterBlock<RecommendationListItem>;
  href: string;
}

export function uniqueRecommendations(
  sources: HomeSource[],
  extra: RecommendationListItem[] = []
): RecommendationListItem[] {
  const map = new Map<number, RecommendationListItem>();
  for (const source of sources) {
    for (const item of source.block.items ?? []) map.set(item.id, item);
  }
  for (const item of extra) map.set(item.id, item);
  return [...map.values()];
}

export function splitAgenda(items: RecommendationListItem[]) {
  const overdue: RecommendationListItem[] = [];
  const today: RecommendationListItem[] = [];
  const week: RecommendationListItem[] = [];

  for (const item of items) {
    if (item.overdue) {
      overdue.push(item);
      continue;
    }
    const days = daysUntil(item.target_date);
    if (days === 0) today.push(item);
    else if (days !== null && days > 0 && days <= 7) week.push(item);
  }

  const byDate = (a: RecommendationListItem, b: RecommendationListItem) => {
    const aDays = daysUntil(a.target_date);
    const bDays = daysUntil(b.target_date);
    if (aDays === null && bDays === null) return b.priority_score - a.priority_score;
    if (aDays === null) return 1;
    if (bDays === null) return -1;
    return aDays - bDays;
  };

  overdue.sort(byDate);
  today.sort(byDate);
  week.sort(byDate);
  return { overdue, today, week };
}
