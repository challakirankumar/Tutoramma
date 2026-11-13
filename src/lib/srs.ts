/** SM-2 spaced repetition (client + server safe, no dependencies). */

/* ------------------------------------------------------------------ */
/* SM-2 spaced repetition                                              */
/* ------------------------------------------------------------------ */

export type Rating = "again" | "hard" | "good" | "easy";

export interface CardSchedule {
  ease: number;
  interval: number; // days
  reps: number;
  lapses: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Returns the next schedule and due date for a review. "again" re-queues the card in 10 minutes. */
export function scheduleReview(card: CardSchedule, rating: Rating, now = Date.now()): CardSchedule & { dueAt: Date } {
  let { ease, interval, reps, lapses } = card;
  if (rating === "again") {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0;
    return { ease, interval, reps, lapses, dueAt: new Date(now + 10 * 60 * 1000) };
  }
  const q = rating === "hard" ? 3 : rating === "good" ? 4 : 5;
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  reps += 1;
  if (reps === 1) interval = rating === "easy" ? 3 : 1;
  else if (reps === 2) interval = rating === "hard" ? 3 : rating === "easy" ? 8 : 6;
  else interval = Math.round(interval * (rating === "hard" ? 1.2 : rating === "easy" ? ease * 1.3 : ease));
  interval = Math.min(365, Math.max(1, interval));
  return { ease: Math.round(ease * 100) / 100, interval, reps, lapses, dueAt: new Date(now + interval * DAY) };
}

/** Human label for the next interval a rating would produce (shown on the rating buttons). */
export function previewInterval(card: CardSchedule, rating: Rating): string {
  const next = scheduleReview(card, rating, 0);
  if (rating === "again") return "10m";
  const d = next.interval;
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return "1y";
}

