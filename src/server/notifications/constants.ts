/** Hub-invariant notification limits. These live in the Hub-invariant zone
 *  (ADR-0013) — never per-community admin settings. A future Hub-operator epic
 *  will make them operator-tunable; for now they are platform constants. */
export const BROADCAST_CEILING = 3; // promotional broadcast emails / member / window
export const CEILING_WINDOW_DAYS = 7;
// Consumed by the Hub-operator limits read (hubOperator.notificationLimits, T12).
export const DIGEST_CADENCE = "weekly" as const;
export const EVENT_REMINDER_LEAD_HOURS = 24;

/** ISO-week bucket key, e.g. "2026-W22". Used as the ceiling window key and the
 *  weekly digest period key (idempotency). Deterministic for a given instant. */
function isoWeekKey(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // ISO 8601: week day Mon=1..Sun=7; shift to nearest Thursday.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// currentWindowKey (broadcast-ceiling window) and currentPeriodKey (weekly
// digest idempotency) are intentionally distinct names over the same ISO-week
// bucket today; they are kept separate so either cadence can diverge later
// without touching the other's call sites.
export function currentWindowKey(now: Date): string {
  return isoWeekKey(now);
}

export function currentPeriodKey(now: Date): string {
  return isoWeekKey(now);
}
