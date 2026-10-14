import { and, gte, isNotNull, isNull, or } from "drizzle-orm";

import {
  suggestWeeklyTopics,
  type WeeklyTopic,
} from "@/lib/news/weekly-topics";
import { db } from "@/server/db";
import {
  newsItems,
  newsStorylineReservations,
  newsStorylines,
} from "@/server/db/schema";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Topics for the contribute page, taken from headlines stored this week.
 * An empty list means the page hides the block.
 */
export async function listWeeklyStoryTopics(
  now = new Date(),
): Promise<WeeklyTopic[]> {
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const [items, stories, reservations] = await Promise.all([
    db
      .select({
        id: newsItems.id,
        title: newsItems.title,
        publishedAt: newsItems.publishedAt,
        createdAt: newsItems.createdAt,
      })
      .from(newsItems)
      .where(
        or(
          gte(newsItems.publishedAt, weekAgo),
          and(isNull(newsItems.publishedAt), gte(newsItems.createdAt, weekAgo)),
        ),
      ),
    db.select({ slug: newsStorylines.slug }).from(newsStorylines),
    db
      .select({ topicKey: newsStorylineReservations.topicKey })
      .from(newsStorylineReservations)
      .where(
        and(
          isNull(newsStorylineReservations.releasedAt),
          or(
            gte(newsStorylineReservations.expiresAt, now),
            isNotNull(newsStorylineReservations.draftId),
          ),
        ),
      ),
  ]);
  const occupied = new Set<string>([
    ...stories.map((story) => story.slug),
    ...reservations.map((reservation) => reservation.topicKey),
  ]);
  return suggestWeeklyTopics(
    items.flatMap((item) => {
      const at = item.publishedAt ?? item.createdAt;
      return at ? [{ id: item.id, title: item.title, at }] : [];
    }),
    occupied,
    now,
  );
}
