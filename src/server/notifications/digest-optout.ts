import { notificationOptouts } from "@/server/db/schema";
import { db } from "@/server/db";

/** Insert the global digest opt-out. A repeat click is a no-op. */
export async function recordGlobalDigestOptOut(userId: string): Promise<void> {
  await db
    .insert(notificationOptouts)
    .values({
      userId,
      communityId: null,
      category: "digest",
    })
    .onConflictDoNothing();
}
