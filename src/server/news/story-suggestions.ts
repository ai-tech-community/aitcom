import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { memberProfiles, newsStorySuggestions, user } from "@/server/db/schema";
import {
  submitStorySuggestion,
  type StorySuggestionWrite,
} from "@/lib/news/story-suggestion";

export { submitStorySuggestion } from "@/lib/news/story-suggestion";

export const storySuggestionDb: StorySuggestionWrite = {
  async countRecent(userId, since) {
    const rows = await db
      .select({ id: newsStorySuggestions.id })
      .from(newsStorySuggestions)
      .where(
        and(
          eq(newsStorySuggestions.userId, userId),
          gt(newsStorySuggestions.createdAt, since),
        ),
      );
    return rows.length;
  },
  async insert(row) {
    const [created] = await db
      .insert(newsStorySuggestions)
      .values(row)
      .returning({ id: newsStorySuggestions.id });
    return created!.id;
  },
};

export type OpenStorySuggestion = {
  id: string;
  body: string;
  url: string | null;
  createdAt: Date;
  /** A name or email already stored for this member. */
  submitter: string;
};

export async function listOpenStorySuggestions(): Promise<
  OpenStorySuggestion[]
> {
  const rows = await db
    .select({
      id: newsStorySuggestions.id,
      body: newsStorySuggestions.body,
      url: newsStorySuggestions.url,
      createdAt: newsStorySuggestions.createdAt,
      displayName: memberProfiles.displayName,
      name: user.name,
      email: user.email,
    })
    .from(newsStorySuggestions)
    .innerJoin(user, eq(user.id, newsStorySuggestions.userId))
    .leftJoin(
      memberProfiles,
      eq(memberProfiles.userId, newsStorySuggestions.userId),
    )
    .where(isNull(newsStorySuggestions.reviewedAt))
    .orderBy(desc(newsStorySuggestions.createdAt))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    url: row.url,
    createdAt: row.createdAt,
    submitter: row.displayName?.trim() || row.name?.trim() || row.email,
  }));
}

export async function reviewStorySuggestion(
  id: string,
  now: Date,
): Promise<"ok" | "missing"> {
  const updated = await db
    .update(newsStorySuggestions)
    .set({ reviewedAt: now })
    .where(
      and(
        eq(newsStorySuggestions.id, id),
        isNull(newsStorySuggestions.reviewedAt),
      ),
    )
    .returning({ id: newsStorySuggestions.id });
  if (updated.length > 0) return "ok";
  const [existing] = await db
    .select({ id: newsStorySuggestions.id })
    .from(newsStorySuggestions)
    .where(eq(newsStorySuggestions.id, id))
    .limit(1);
  return existing ? "ok" : "missing";
}
