/**
 * Helpers for the role homes' action lists: queue labels and one ranking of
 * cases across queues (department overdue first, then risk, then the nearest
 * binding deadline, then priority).
 */
import { daysUntil } from "@/lib/format";
import { T } from "@/lib/i18n";
import type { ActionCenterBlock, RecommendationListItem } from "@/lib/types";

const RISK_WEIGHT = { high: 0, medium: 1, low: 2 } as const;

export interface ActionSource {
  key: string;
  block: ActionCenterBlock<RecommendationListItem>;
  href: string;
}

export function queueLabel(key: string) {
  return (T.actionCenter as Record<string, string>)[key] ?? key;
}

export function rank(sources: ActionSource[]) {
  const seen = new Map<number, { item: RecommendationListItem; reason: string; queue: string }>();

  for (const source of sources) {
    for (const item of source.block.items ?? []) {
      if (!seen.has(item.id)) {
        seen.set(item.id, { item, reason: queueLabel(source.key), queue: source.key });
      }
    }
  }

  return [...seen.values()].sort((a, b) => {
    if (a.item.overdue !== b.item.overdue) return a.item.overdue ? -1 : 1;
    const risk = RISK_WEIGHT[a.item.risk_level] - RISK_WEIGHT[b.item.risk_level];
    if (risk !== 0) return risk;
    const aDays = daysUntil(a.item.deadline);
    const bDays = daysUntil(b.item.deadline);
    if (aDays !== null && bDays !== null && aDays !== bDays) return aDays - bDays;
    if (aDays === null && bDays !== null) return 1;
    if (bDays === null && aDays !== null) return -1;
    return b.item.priority_score - a.item.priority_score;
  });
}
