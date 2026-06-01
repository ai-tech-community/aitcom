import { and, eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { agentManifestAcceptances } from "@/server/db/schema";
import { MANIFEST_VERSION } from "./manifest";

type DB = typeof _db;

/** True iff this owner has accepted the CURRENT manifest version. */
export async function hasAcceptedCurrentManifest(
  db: DB,
  ownerId: string | null,
): Promise<boolean> {
  if (!ownerId) return false;
  const [row] = await db
    .select({ id: agentManifestAcceptances.id })
    .from(agentManifestAcceptances)
    .where(
      and(
        eq(agentManifestAcceptances.ownerId, ownerId),
        eq(agentManifestAcceptances.manifestVersion, MANIFEST_VERSION),
      ),
    )
    .limit(1);
  return Boolean(row);
}
