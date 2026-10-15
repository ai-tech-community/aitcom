import { and, asc, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  newsStorylineAnnouncements,
  newsStorylines,
  user,
} from "@/server/db/schema";
import { sendStorylineAnnounceEmail } from "@/server/email";

import {
  announcePublishedStorylines,
  type AnnounceStore,
} from "./announce-storylines";

function unsent(database: typeof db, storyId: string) {
  return notExists(
    database
      .select({ one: sql`1` })
      .from(newsStorylineAnnouncements)
      .where(
        and(
          eq(newsStorylineAnnouncements.storylineId, storyId),
          eq(newsStorylineAnnouncements.userId, user.id),
        ),
      ),
  );
}

export function createAnnounceStore(database: typeof db = db): AnnounceStore {
  return {
    async pendingStories(limit) {
      return database
        .select({
          id: newsStorylines.id,
          slug: newsStorylines.slug,
          title: newsStorylines.titleEn,
          summary: newsStorylines.overviewEn,
          status: newsStorylines.status,
          publishedAt: newsStorylines.publishedAt,
          announcedAt: newsStorylines.announcedAt,
        })
        .from(newsStorylines)
        .where(
          and(
            eq(newsStorylines.status, "published"),
            isNotNull(newsStorylines.publishedAt),
            isNull(newsStorylines.announcedAt),
          ),
        )
        .orderBy(asc(newsStorylines.publishedAt), asc(newsStorylines.id))
        .limit(limit);
    },
    async recipients(storyId, opts) {
      return database
        .select({
          id: user.id,
          email: user.email,
          optedOutAt: user.newsStoryEmailOptedOutAt,
        })
        .from(user)
        .where(
          and(
            isNull(user.newsStoryEmailOptedOutAt),
            opts.onlyEmail
              ? sql`lower(${user.email}) = ${opts.onlyEmail}`
              : undefined,
            unsent(database, storyId),
          ),
        )
        .orderBy(asc(user.id))
        .limit(opts.limit);
    },
    async claim(storyId, userId) {
      const rows = await database
        .insert(newsStorylineAnnouncements)
        .values({ storylineId: storyId, userId })
        .onConflictDoNothing()
        .returning({ userId: newsStorylineAnnouncements.userId });
      return rows.length > 0;
    },
    async release(storyId, userId) {
      await database
        .delete(newsStorylineAnnouncements)
        .where(
          and(
            eq(newsStorylineAnnouncements.storylineId, storyId),
            eq(newsStorylineAnnouncements.userId, userId),
          ),
        );
    },
    async markAnnouncedIfComplete(storyId) {
      const [left] = await database
        .select({ id: user.id })
        .from(user)
        .where(
          and(isNull(user.newsStoryEmailOptedOutAt), unsent(database, storyId)),
        )
        .limit(1);
      if (left) return false;
      const rows = await database
        .update(newsStorylines)
        .set({ announcedAt: new Date() })
        .where(
          and(
            eq(newsStorylines.id, storyId),
            isNull(newsStorylines.announcedAt),
          ),
        )
        .returning({ id: newsStorylines.id });
      return rows.length > 0;
    },
  };
}

export async function announcePublishedStorylinesFromDb(
  env: NodeJS.ProcessEnv = process.env,
) {
  return announcePublishedStorylines(
    createAnnounceStore(),
    env,
    (to, message) => sendStorylineAnnounceEmail(to, message, env),
  );
}
