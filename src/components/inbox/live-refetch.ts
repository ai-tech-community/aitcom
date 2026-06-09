/**
 * Tier-0 near-real-time cadence for inbox queries (see ADR-0025).
 *
 * These are the *foreground* polling intervals: React Query pauses interval
 * refetch while the tab is backgrounded (`refetchIntervalInBackground` defaults
 * to false), so an open-but-hidden tab does not poll. Combined with optimistic
 * UI on send, this gives a near-real-time *perception* for ~zero infrastructure.
 *
 * Upgrade path (ADR-0025 Tier 1): replace these polled subscriptions with an
 * SSE stream backed by a pub/sub fabric, at which point these constants go away.
 */
export const LIVE_MESSAGES_REFETCH_MS = 3_000;
export const LIVE_BADGE_REFETCH_MS = 10_000;
