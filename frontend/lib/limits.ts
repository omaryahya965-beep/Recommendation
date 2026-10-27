/**
 * Bounds the API enforces (backend apps/core/limits.py and the date rules);
 * the UI uses the same numbers for counters, maxLength and date min/max.
 */
export const RECOMMENDATION_TEXT_MAX = 20_000;
export const NOTE_MAX = 5_000;
/** Each of a plan stage's description / expected output / evidence (stored together, ≤ NOTE_MAX). */
export const STEP_PART_MAX = 1_500;
/** One assistant question (backend AssistantRequestSerializer). */
export const ASSISTANT_MESSAGE_MAX = 4_000;
export const MAX_REMINDER_OFFSET_DAYS = 365;
/** Plan target date: today to five years ahead. */
export const MAX_PLAN_YEARS = 5;
/** Report response deadline: today to two years ahead. */
export const MAX_RESPONSE_DEADLINE_DAYS = 730;

/** YYYY-MM-DD for today plus `days`, in local time (date inputs' format). */
export function isoDateFromToday(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
