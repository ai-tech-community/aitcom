import { env } from "@/env";

/** Collector ids switched off by `COLLECTORS_DISABLED`. */
export function disabledCollectorIds(): ReadonlySet<string> {
  return new Set(
    (env.COLLECTORS_DISABLED ?? "").split(/[\s,]+/).filter(Boolean),
  );
}
