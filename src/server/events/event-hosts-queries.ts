import { and, inArray, isNull } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { communities } from "@/server/db/schema";

type DB = typeof _db;

/**
 * Names of the communities hosting a set of events, keyed by community id.
 * One query for the whole list; deleted communities are left out so a row
 * never credits a host that is gone.
 */
export async function loadEventHostNames(
  db: DB,
  communityIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(communityIds.filter((id): id is string => Boolean(id))),
  ];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: communities.id, name: communities.name })
    .from(communities)
    .where(and(inArray(communities.id, ids), isNull(communities.deletedAt)));
  return new Map(rows.map((row) => [row.id, row.name]));
}
