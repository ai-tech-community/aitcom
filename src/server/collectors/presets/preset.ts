// src/server/collectors/presets/preset.ts
import type { PresetGroup } from "@/lib/collectors/presets";

import type { Collector, FieldHint, LocalizedText } from "../collector";

/**
 * A named, ready-made start for one collector (Prototype): a prototype input
 * the member copies and adjusts. Presets are reviewed code, like the collector
 * catalog (ADR-0040); every run they start goes through the same guarded
 * context as any other run.
 */
export interface CollectorPreset<I> {
  /** URL slug, e.g. "greenhouse-board". */
  id: string;
  group: PresetGroup;
  title: LocalizedText;
  /** One sentence: what it reads. */
  summary: LocalizedText;
  /** Must exist in the collector catalog. */
  collectorId: string;
  /** The full input, minus the fields the member must give. */
  base: Partial<I>;
  /** Input fields shown up front; everything else sits behind "Show settings". */
  ask: readonly (keyof I & string)[];
  /** Field hints that replace the collector's own for this preset. */
  hints?: Partial<Record<keyof I & string, FieldHint>>;
  /**
   * Recognise a pasted address; return the input to pre-fill, or null.
   * Pure: never fetches, so pasting a link sends nothing to that site.
   */
  recognize?: (url: URL) => Partial<I> | null;
}

// A catalog of presets for different collectors needs `any` (as AnyCollector).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPreset = CollectorPreset<any>;

/**
 * A preset for `collector`, typed by that collector's input, so `base`, `ask`
 * and `hints` can only name fields the collector has.
 */
export function definePreset<I, R extends Record<string, unknown>>(
  collector: Collector<I, R>,
  preset: NoInfer<Omit<CollectorPreset<I>, "collectorId">>,
): CollectorPreset<I> {
  return { ...preset, collectorId: collector.id };
}
