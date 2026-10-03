import { env } from "@/env";

/** The deployment switch for data collectors (`FEATURE_COLLECTORS=on`). */
export function collectorsEnabled(): boolean {
  return env.FEATURE_COLLECTORS === "on";
}

/** Collector ids switched off by `COLLECTORS_DISABLED`. */
export function disabledCollectorIds(): ReadonlySet<string> {
  return new Set(
    (env.COLLECTORS_DISABLED ?? "").split(/[\s,]+/).filter(Boolean),
  );
}
