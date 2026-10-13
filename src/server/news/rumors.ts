import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { newsRumors } from "@/server/db/schema";

import { type RumorWrite } from "./rumor-rules";
import { linkSubmittedRumor } from "./startup-links";

export type { RumorWrite } from "./rumor-rules";
export { moderateNewsRumor, submitNewsRumor } from "./rumor-rules";

export type NewsRumorItem = {
  id: string;
  title: string;
  url: string | null;
  body: string;
  submitterName: string;
  createdAt: Date;
  hiddenAt: Date | null;
};

export async function listNewsRumors(options?: {
  includeHidden?: boolean;
  limit?: number;
}): Promise<NewsRumorItem[]> {
  const limit = options?.limit ?? 50;
  return db
    .select({
      id: newsRumors.id,
      title: newsRumors.title,
      url: newsRumors.url,
      body: newsRumors.body,
      submitterName: newsRumors.submitterName,
      createdAt: newsRumors.createdAt,
      hiddenAt: newsRumors.hiddenAt,
    })
    .from(newsRumors)
    .where(options?.includeHidden ? undefined : isNull(newsRumors.hiddenAt))
    .orderBy(desc(newsRumors.createdAt))
    .limit(limit);
}

export const rumorDb: RumorWrite = {
  async countRecent(userId, since) {
    const rows = await db
      .select({ id: newsRumors.id })
      .from(newsRumors)
      .where(
        and(eq(newsRumors.userId, userId), gt(newsRumors.createdAt, since)),
      );
    return rows.length;
  },
  async insert(row) {
    const [created] = await db
      .insert(newsRumors)
      .values(row)
      .returning({ id: newsRumors.id });
    const id = created!.id;
    await linkSubmittedRumor({
      id,
      title: row.title,
      body: row.body,
      url: row.url,
    });
    return id;
  },
  async setHidden(id, hiddenAt) {
    const updated = await db
      .update(newsRumors)
      .set({ hiddenAt })
      .where(eq(newsRumors.id, id))
      .returning({ id: newsRumors.id });
    return updated.length > 0;
  },
  async remove(id) {
    const removed = await db
      .delete(newsRumors)
      .where(eq(newsRumors.id, id))
      .returning({ id: newsRumors.id });
    return removed.length > 0;
  },
};
