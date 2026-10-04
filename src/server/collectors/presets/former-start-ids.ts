// src/server/collectors/presets/former-start-ids.ts

/**
 * Before presets, a start address and a run named a collector
 * (`/dashboard/collectors/new/feed-items`). Each such collector id maps to the
 * preset that replaced it: old addresses redirect there, and old runs (no
 * preset recorded) are named after it. Frozen — new presets never need an
 * entry. No imports, so screens can use it.
 */
const FORMER_START_IDS: Readonly<Record<string, string>> = Object.freeze({
  "feed-items": "feed",
  "page-list": "custom-page",
});

export function formerStartIds(): Readonly<Record<string, string>> {
  return FORMER_START_IDS;
}

/** The preset that replaced a former start id, or null for any other id. */
export function presetIdForFormerId(id: string): string | null {
  return Object.hasOwn(FORMER_START_IDS, id) ? FORMER_START_IDS[id]! : null;
}
