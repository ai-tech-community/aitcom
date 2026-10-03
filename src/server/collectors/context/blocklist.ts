import { collectorBlockedDomains } from "@/server/db/schema";

import type { CollectorDb } from "../db";

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

/** True when the host or any parent domain opted out. */
export function isBlockedHost(
  host: string,
  blocked: ReadonlySet<string>,
): boolean {
  let candidate = normalizeHost(host);
  for (;;) {
    if (blocked.has(candidate)) return true;
    const dot = candidate.indexOf(".");
    if (dot === -1) return false;
    candidate = candidate.slice(dot + 1);
  }
}

export async function loadBlockedDomains(
  db: CollectorDb,
): Promise<Set<string>> {
  const rows = await db
    .select({ domain: collectorBlockedDomains.domain })
    .from(collectorBlockedDomains);
  return new Set(rows.map((r) => normalizeHost(r.domain)));
}
