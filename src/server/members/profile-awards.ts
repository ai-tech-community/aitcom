import { desc, eq } from "drizzle-orm";
import type { Payload } from "payload";

import type { Challenge } from "@/payload-types";
import type { db as appDb } from "@/server/db";
import { memberAwards } from "@/server/db/schema";
import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";

type Db = typeof appDb;

/**
 * An award (ADR-0039) as the profile's Badges tab shows it: the prize
 * label and, when the viewer may open it, the challenge it came from.
 */
export interface ProfileAward {
  id: string;
  label: string;
  earnedAt: string;
  /** Null when the challenge is gone or not published yet. */
  challenge: { title: string; slug: string } | null;
}

type ChallengeRef = Pick<
  Challenge,
  "id" | "title" | "slug" | "status" | "communityId"
>;

/**
 * Applies the viewer's visibility to award rows (fail-closed). Like
 * hackathon certificates on the Work tab, an award from a challenge in a
 * community the viewer cannot read is left out: its label often names the
 * challenge. So is an award whose challenge no longer exists, since its
 * visibility can no longer be checked; only its owner still sees it. A
 * draft challenge keeps the award but drops the link.
 */
export function toProfileAwards(
  rows: readonly {
    id: string;
    challengeId: number;
    label: string;
    earnedAt: Date;
  }[],
  challenges: ReadonlyMap<number, ChallengeRef>,
  viewer: { hiddenCommunityIds: ReadonlySet<string>; isOwner: boolean },
): ProfileAward[] {
  return rows.flatMap((row): ProfileAward[] => {
    const challenge = challenges.get(row.challengeId);
    if (!challenge && !viewer.isOwner) return [];
    if (
      challenge?.communityId &&
      viewer.hiddenCommunityIds.has(challenge.communityId)
    ) {
      return [];
    }
    const linkable =
      challenge && challenge.status !== "draft" && challenge.slug
        ? { title: challenge.title, slug: challenge.slug }
        : null;
    return [
      {
        id: row.id,
        label: row.label,
        earnedAt: row.earnedAt.toISOString(),
        challenge: linkable,
      },
    ];
  });
}

/** A member's awards as this viewer may see them, newest first. */
export async function loadProfileAwards(
  deps: { db: Db; payload: Payload },
  { userId, viewerId }: { userId: string; viewerId: string | null },
): Promise<ProfileAward[]> {
  const rows = await deps.db
    .select({
      id: memberAwards.id,
      challengeId: memberAwards.challengeId,
      label: memberAwards.label,
      earnedAt: memberAwards.earnedAt,
    })
    .from(memberAwards)
    .where(eq(memberAwards.userId, userId))
    .orderBy(desc(memberAwards.earnedAt), memberAwards.label);
  if (rows.length === 0) return [];

  const challengeIds = [...new Set(rows.map((row) => row.challengeId))];
  const [hidden, challenges] = await Promise.all([
    hiddenContentCommunityIds(deps.db, viewerId),
    deps.payload.find({
      collection: "challenges",
      where: { id: { in: challengeIds } },
      limit: challengeIds.length,
      pagination: false,
      depth: 0,
      select: { title: true, slug: true, status: true, communityId: true },
    }),
  ]);
  return toProfileAwards(
    rows,
    new Map(challenges.docs.map((doc) => [doc.id, doc as ChallengeRef])),
    { hiddenCommunityIds: new Set(hidden), isOwner: viewerId === userId },
  );
}
