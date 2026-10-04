import { CUSTOM_PAGE_PRESET_ID } from "@/lib/collectors/presets";

import type { AnyPreset } from "./preset";

export type PresetMatch = {
  presetId: string;
  /** The input to pre-fill. */
  input: Record<string, unknown>;
  /** False for the Custom page fallback: nothing recognised the address. */
  matched: boolean;
};

/**
 * Which preset a pasted address belongs to: each preset's `recognize`, in
 * catalog order, first answer wins (an ordered scan; a Chain of
 * Responsibility object would be the same behaviour with more code). No
 * answer → the Custom page with the address filled in. Never fetches.
 * Null only when the Custom page itself is unavailable.
 */
export function recognizePreset(
  url: URL,
  presets: readonly AnyPreset[],
): PresetMatch | null {
  for (const preset of presets) {
    if (!preset.recognize) continue;
    let input: Record<string, unknown> | null;
    try {
      // Its own copy: a recognizer that changes the URL cannot affect the next.
      input = preset.recognize(new URL(url.href));
    } catch (err) {
      // A broken recognizer must not stop pasting: count it as no match.
      console.error(
        `[collectors] preset ${preset.id} failed to recognise an address`,
        err,
      );
      continue;
    }
    if (input)
      return { presetId: preset.id, input: { ...input }, matched: true };
  }
  const custom = presets.find((p) => p.id === CUSTOM_PAGE_PRESET_ID);
  return custom
    ? { presetId: custom.id, input: { url: url.href }, matched: false }
    : null;
}
