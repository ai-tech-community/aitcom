import { and, eq, sql } from "drizzle-orm";
import {
  storylineVoteChoice,
  type StorylineVoteChoice,
} from "@/lib/news/storyline-vote";
import { db } from "@/server/db";
import { newsStorylines, newsStorylineVotes } from "@/server/db/schema";

export class StorylineVoteError extends Error {
  constructor(readonly code: "missing") {
    super(code);
    this.name = "StorylineVoteError";
  }
}

export type StorylineVoteResult = {
  score: number;
  myVote: StorylineVoteChoice | null;
};

/** Replace this member's vote, or clear it. Unpublished stories cannot be voted on. */
export async function castStorylineVote(input: {
  storyId: string;
  userId: string;
  vote: StorylineVoteChoice | "clear";
}): Promise<StorylineVoteResult> {
  return db.transaction(async (tx) => {
    const [story] = await tx
      .select({ id: newsStorylines.id })
      .from(newsStorylines)
      .where(
        and(
          eq(newsStorylines.id, input.storyId),
          eq(newsStorylines.status, "published"),
        ),
      )
      .limit(1);
    if (!story) throw new StorylineVoteError("missing");
    const mine = and(
      eq(newsStorylineVotes.storyId, input.storyId),
      eq(newsStorylineVotes.userId, input.userId),
    );
    if (input.vote === "clear") {
      await tx.delete(newsStorylineVotes).where(mine);
    } else {
      const value = input.vote === "up" ? 1 : -1;
      await tx
        .insert(newsStorylineVotes)
        .values({
          storyId: input.storyId,
          userId: input.userId,
          value,
        })
        .onConflictDoUpdate({
          target: [newsStorylineVotes.storyId, newsStorylineVotes.userId],
          set: { value, updatedAt: new Date() },
        });
    }
    const [row] = await tx
      .select({
        score: sql<number>`coalesce(sum(${newsStorylineVotes.value}), 0)::int`,
        mine: sql<
          number | null
        >`max(${newsStorylineVotes.value}) filter (where ${newsStorylineVotes.userId} = ${input.userId})`,
      })
      .from(newsStorylineVotes)
      .where(eq(newsStorylineVotes.storyId, input.storyId));
    return {
      score: Number(row?.score ?? 0),
      myVote: storylineVoteChoice(row?.mine),
    };
  });
}
