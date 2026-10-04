/**
 * Preset facts that screens need as well as the server: rail groups, the
 * Custom page id and the former start ids. No imports, so client code can use
 * it without reaching into `src/server/`. The preset catalog itself stays on
 * the server (`src/server/collectors/presets/`).
 */

/** Rail groups, in rail order. The Custom page is always last. */
export const PRESET_GROUPS = ["jobs", "research", "custom"] as const;
export type PresetGroup = (typeof PRESET_GROUPS)[number];

/** The preset every unrecognised address opens: page-list, member's selectors. */
export const CUSTOM_PAGE_PRESET_ID = "custom-page";

/**
 * Before presets, a start address and a run named a collector
 * (`/dashboard/collectors/new/feed-items`). Each such collector id maps to the
 * preset that replaced it: old addresses redirect there, and old runs (no
 * preset recorded) are named after it. Frozen — new presets never need an
 * entry.
 */
const FORMER_START_IDS: Readonly<Record<string, string>> = Object.freeze({
  "feed-items": "feed",
  "page-list": CUSTOM_PAGE_PRESET_ID,
});

export function formerStartIds(): Readonly<Record<string, string>> {
  return FORMER_START_IDS;
}

/** The preset that replaced a former start id, or null for any other id. */
export function presetIdForFormerId(id: string): string | null {
  return Object.hasOwn(FORMER_START_IDS, id) ? FORMER_START_IDS[id]! : null;
}
