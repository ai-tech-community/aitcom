/**
 * Awards (ADR-0039): prizes from a specific challenge or hackathon ("Winner
 * — RAG Hack 2026"). Not catalog badges: each one carries the challenge it
 * came from and that challenge's prize text as its label.
 */
import { clipText, oneLine } from "@/lib/text-utils";
import { memberAwards } from "@/server/db/schema";

import type { BadgeDb } from "./metrics";
import { notifyAwardWon } from "./notify";

/** `member_award.label` is varchar(200). */
export const AWARD_LABEL_MAX = 200;

/** The label stored for a challenge's prize text; null when it is empty. */
export function awardLabel(
  prizeText: string | null | undefined,
): string | null {
  const label = clipText(oneLine(prizeText ?? ""), AWARD_LABEL_MAX);
  return label || null;
}

/**
 * Gives a member a challenge's award, once per (member, challenge, label).
 * A live award is celebrated: it stays unseen (`seen_at` null) and gets an
 * `award_won` notification, the earning moment's marker for awards.
 * Never breaks the caller: it runs in its own savepoint and logs failures.
 * Returns whether a new award was recorded.
 */
export async function grantChallengeAward(
  db: BadgeDb,
  input: { userId: string; challengeId: number; prizeText: string | null },
): Promise<boolean> {
  const label = awardLabel(input.prizeText);
  if (!label) return false;
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(memberAwards)
        .values({ userId: input.userId, challengeId: input.challengeId, label })
        .onConflictDoNothing()
        .returning({ id: memberAwards.id });
      if (!row) return false;
      await notifyAwardWon(tx, input.userId, { id: row.id, label });
      return true;
    });
  } catch (err) {
    console.error(
      `badges: award for challenge ${input.challengeId} to ${input.userId} failed`,
      err,
    );
    return false;
  }
}
