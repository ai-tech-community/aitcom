import { count, eq, isNull, sql } from "drizzle-orm";

import type { db as Database } from "@/server/db";
import { communities, spaces } from "@/server/db/schema";
import { ensureMagazineSpace } from "@/server/magazines/magazine-service";

import { seedDefaultSpaces } from "./seed-default-spaces";

type DB = typeof Database;

export type CommunityWithoutSpaces = {
  id: string;
  slug: string;
  name: string;
};

/** `--write` applies the rows. Any other invocation only reports them. */
export function backfillWrites(argv: readonly string[]): boolean {
  return argv.includes("--write");
}

/** Communities whose space count is zero. A partial nav is left alone. */
export function communitiesWithoutSpaces<T extends { spaceCount: number }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => Number(row.spaceCount) === 0);
}

export async function listCommunitiesWithoutSpaces(
  db: DB,
): Promise<CommunityWithoutSpaces[]> {
  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      spaceCount: count(spaces.id),
    })
    .from(communities)
    .leftJoin(spaces, eq(spaces.communityId, communities.id))
    .where(isNull(communities.deletedAt))
    .groupBy(communities.id, communities.slug, communities.name)
    .having(sql`count(${spaces.id}) = 0`);
  return communitiesWithoutSpaces(rows).map(({ id, slug, name }) => ({
    id,
    slug,
    name,
  }));
}

async function communityHasMagazine(
  db: DB,
  communityId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    select 1 as ok from "magazines" where "community_id" = ${communityId} limit 1
  `);
  const rows = ((result as { rows?: unknown }).rows ?? result) as unknown[];
  return rows.length > 0;
}

/**
 * Insert the default spaces for communities that have none. When that
 * community already has a magazine, also add the Magazine tab. A second run
 * finds nothing to do. Does not touch communities that already have a space.
 */
export async function writeMissingDefaultSpaces(
  db: DB,
  targets: readonly CommunityWithoutSpaces[],
): Promise<number> {
  let written = 0;
  for (const target of targets) {
    const did = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.communityId, target.id))
        .limit(1);
      if (existing.length > 0) return false;
      await seedDefaultSpaces(tx, target.id);
      if (await communityHasMagazine(db, target.id)) {
        await ensureMagazineSpace(tx as unknown as DB, target.id);
      }
      return true;
    });
    if (did) written += 1;
  }
  return written;
}
