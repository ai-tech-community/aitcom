import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { user } from "@/server/db/schema";

/** Stamp the story-email opt-out. A second click leaves the original time. */
export async function recordStoryEmailOptOut(userId: string): Promise<void> {
  await db
    .update(user)
    .set({ newsStoryEmailOptedOutAt: new Date() })
    .where(and(eq(user.id, userId), isNull(user.newsStoryEmailOptedOutAt)));
}
