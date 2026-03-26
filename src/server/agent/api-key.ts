import { createHash, randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { agentApiKeys, agentProfiles } from "@/server/db/schema";

type DB = typeof _db;

const KEY_PREFIX = "ait_sk_";

export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const rawBytes = randomBytes(32);
  const raw = KEY_PREFIX + rawBytes.toString("base64url");
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, KEY_PREFIX.length + 8);
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function validateApiKey(
  db: DB,
  raw: string,
): Promise<{ agentId: string; ownerId: string | null; scopes: string[] } | null> {
  const hash = hashApiKey(raw);

  const [key] = await db
    .select({
      id: agentApiKeys.id,
      agentId: agentApiKeys.agentId,
      ownerId: agentApiKeys.ownerId,
      scopes: agentApiKeys.scopes,
      agentStatus: agentProfiles.status,
    })
    .from(agentApiKeys)
    .innerJoin(agentProfiles, eq(agentApiKeys.agentId, agentProfiles.id))
    .where(and(eq(agentApiKeys.keyHash, hash), eq(agentApiKeys.isActive, true)))
    .limit(1);

  if (!key || (key.agentStatus !== "active" && key.agentStatus !== "unclaimed")) return null;

  // Update last used timestamp (fire and forget)
  void db
    .update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, key.id));

  return { agentId: key.agentId, ownerId: key.ownerId, scopes: key.scopes };
}
