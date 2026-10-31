import { and, eq } from "drizzle-orm";
import type { db as appDb } from "@/server/db";
import { agentApiKeys, agentProfiles } from "@/server/db/schema";

/** Existing owner-bound credentials only. Never issues or returns a key. */
export async function collectorAgentAccess(db: typeof appDb, userId: string) {
  const rows = await db
    .select({ scopes: agentApiKeys.scopes })
    .from(agentApiKeys)
    .innerJoin(agentProfiles, eq(agentApiKeys.agentId, agentProfiles.id))
    .where(
      and(
        eq(agentProfiles.ownerId, userId),
        eq(agentProfiles.status, "active"),
        eq(agentApiKeys.ownerId, userId),
        eq(agentApiKeys.isActive, true),
      ),
    );
  return {
    hasKey: rows.length > 0,
    allowed:
      rows.length > 0 && rows.some((row) => row.scopes.includes("collect")),
  };
}
export async function setCollectorAgentAccess(
  db: typeof appDb,
  userId: string,
  allowed: boolean,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.ownerId, userId),
          eq(agentProfiles.status, "active"),
        ),
      )
      .limit(1)
      .for("update");
    if (!agent) return false;
    const keys = await tx
      .select({ id: agentApiKeys.id, scopes: agentApiKeys.scopes })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.ownerId, userId),
          eq(agentApiKeys.isActive, true),
        ),
      )
      .for("update");
    for (const key of keys) {
      const scopes = key.scopes.filter((scope) => scope !== "collect");
      if (allowed) scopes.push("collect");
      await tx
        .update(agentApiKeys)
        .set({ scopes })
        .where(
          and(
            eq(agentApiKeys.id, key.id),
            eq(agentApiKeys.ownerId, userId),
            eq(agentApiKeys.isActive, true),
          ),
        );
    }
    return keys.length > 0;
  });
}
