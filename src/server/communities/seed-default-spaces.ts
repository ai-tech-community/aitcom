import type { db as Database } from "@/server/db";
import { spaces } from "@/server/db/schema";

import { buildDefaultSpaceRows } from "./space-defaults";

type DB = typeof Database;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * The same default builtin spaces the community form inserts: forum, events,
 * classroom, ideas, and members. Magazine is not one of them; it is added
 * when the community's magazine is created.
 */
export async function seedDefaultSpaces(
  db: DB | Tx,
  communityId: string,
): Promise<void> {
  await db
    .insert(spaces)
    .values(buildDefaultSpaceRows(communityId))
    .onConflictDoNothing({
      target: [spaces.communityId, spaces.slug],
    });
}
