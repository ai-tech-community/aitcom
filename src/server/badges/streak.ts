import { evaluateBadges, type BadgeDb, type EarnOutcome } from "./engine";

/** Members whose Streak track this instance already evaluated, by UTC day. */
const evaluatedOn = new Map<string, string>();
/** Bounds the memo on a long-lived instance; clearing only costs a re-check. */
const MEMO_MAX = 10_000;

/**
 * Evaluates the Streak track on a member's activity, at most once per
 * member per UTC day on this instance. The first activity of a day is the
 * one that can extend a streak, so later ones that day add nothing. The
 * day is marked only after a successful evaluation, so a failed one is
 * retried on the member's next activity. Instance-local by design: another
 * instance may evaluate again the same day, which is harmless (earning is
 * idempotent) and cheap.
 */
export async function evaluateStreakOncePerDay(
  db: BadgeDb,
  userId: string,
  now: Date = new Date(),
): Promise<EarnOutcome | null> {
  const day = now.toISOString().slice(0, 10);
  if (evaluatedOn.get(userId) === day) return null;
  const outcome = await evaluateBadges(db, userId, ["streak"]);
  if (outcome.ok) {
    if (evaluatedOn.size >= MEMO_MAX) evaluatedOn.clear();
    evaluatedOn.set(userId, day);
  }
  return outcome;
}

/** Test seam: forget which members were evaluated. */
export function resetStreakMemo(): void {
  evaluatedOn.clear();
}
