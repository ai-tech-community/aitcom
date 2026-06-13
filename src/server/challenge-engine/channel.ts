import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { challengeChannels } from "@/server/db/schema";

// Accept either the top-level db or a transaction handle (same interface).
type AnyDb = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ensure a challenge channel row exists for `challengeId`.
 * Idempotent: insert with onConflictDoNothing, then re-fetch if needed.
 * Returns the channel row, or null if something went very wrong.
 */
export async function ensureChallengeChannel(
  anyDb: AnyDb,
  challengeId: number,
) {
  let [channel] = await anyDb
    .select()
    .from(challengeChannels)
    .where(eq(challengeChannels.challengeId, challengeId))
    .limit(1);

  if (!channel) {
    [channel] = await anyDb
      .insert(challengeChannels)
      .values({ challengeId })
      .onConflictDoNothing()
      .returning();

    // Race condition: another writer beat us; fetch existing row
    if (!channel) {
      [channel] = await anyDb
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, challengeId))
        .limit(1);
    }
  }

  return channel ?? null;
}
