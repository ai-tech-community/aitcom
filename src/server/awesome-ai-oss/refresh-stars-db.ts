import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { awesomeAiOssProjects } from "@/server/db/schema";
import {
  refreshAwesomeStarCounts,
  type RefreshAwesomeStarsResult,
} from "@/server/awesome-ai-oss/refresh-stars";

export async function refreshStoredAwesomeStars(): Promise<RefreshAwesomeStarsResult> {
  return refreshAwesomeStarCounts({
    listProjects: async () =>
      db
        .select({
          id: awesomeAiOssProjects.id,
          repoUrl: awesomeAiOssProjects.repoUrl,
          repoHost: awesomeAiOssProjects.repoHost,
        })
        .from(awesomeAiOssProjects)
        .where(eq(awesomeAiOssProjects.status, "approved")),
    updateStars: async (id, starCount, checkedAt) => {
      await db
        .update(awesomeAiOssProjects)
        .set({ starCount, starsCheckedAt: checkedAt })
        .where(eq(awesomeAiOssProjects.id, id));
    },
  });
}
