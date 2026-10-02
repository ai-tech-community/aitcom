import { awardMilestone, evaluateBadges, type EarnOptions } from "./engine";
import type { BadgeDb } from "./metrics";

/**
 * An article of this author was approved and published: the Writer track
 * may have moved, and a tutorial is the Tutorial creator milestone.
 */
export async function onArticleApproved(
  db: BadgeDb,
  article: { authorId: string; type: string | null | undefined },
  options: EarnOptions = {},
): Promise<void> {
  await evaluateBadges(db, article.authorId, ["writer"], options);
  if (article.type === "tutorial") {
    await awardMilestone(db, article.authorId, "tutorial_creator", options);
  }
}
