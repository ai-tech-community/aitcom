import { presetIdForFormerId } from "@/server/collectors/presets/former-start-ids";

/** An address as a short label (host and path); any other text as it is. */
export function formatTarget(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

/** A short, human label for what a run was pointed at: its first string input. */
export function runTarget(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const first = Object.values(input).find((v) => typeof v === "string");
  return typeof first === "string" ? formatTarget(first) : null;
}

/** One input field as a label, or null when it is empty or not a single value. */
export function mainInput(
  input: unknown,
  field: string | undefined,
): string | null {
  if (field === undefined || !input || typeof input !== "object") return null;
  if (!Object.hasOwn(input, field)) return null;
  const value = (input as Record<string, unknown>)[field];
  if (typeof value === "string") {
    return value.trim() ? formatTarget(value.trim()) : null;
  }
  return typeof value === "number" ? String(value) : null;
}

/** The preset a run came from; for a run from before presets, its replacement. */
export function presetIdOfRun(run: {
  presetId: string | null;
  collectorId: string;
}): string | null {
  return run.presetId ?? presetIdForFormerId(run.collectorId);
}

export type RunName = { title: string; detail: string | null };

type NamingPreset = { id: string; title: string; ask: readonly string[] };
type NamedRun = {
  presetId: string | null;
  collectorId: string;
  input: unknown;
};

/** Every preset's and collector's title, switched-off ones included. */
export type CatalogTitleMaps = {
  presets: ReadonlyMap<string, string>;
  collectors: ReadonlyMap<string, string>;
};

/**
 * What a run is called on every screen: its preset's title and the preset's
 * main (first asked) input, e.g. "Greenhouse board · acme". A run whose
 * preset is switched off keeps that preset's title; one whose preset is gone
 * falls back to its collector's title. The detail then is its first address.
 */
export function runName(
  run: NamedRun,
  presets: readonly NamingPreset[],
  titles: CatalogTitleMaps,
): RunName {
  const presetId = presetIdOfRun(run);
  const preset = presets.find((p) => p.id === presetId);
  return {
    title:
      preset?.title ??
      (presetId === null ? undefined : titles.presets.get(presetId)) ??
      titles.collectors.get(run.collectorId) ??
      run.collectorId,
    detail: mainInput(run.input, preset?.ask[0]) ?? runTarget(run.input),
  };
}
