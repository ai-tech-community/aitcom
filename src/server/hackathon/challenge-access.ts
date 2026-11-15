/**
 * Who may see a challenge (and a hackathon's spectator view of it): the
 * content rule of the challenge's community, through the read seam
 * (ADR-0030, ADR-0050). A challenge with no community is Hub-wide and
 * public. Anything the viewer may not read answers NOT_FOUND, the same as
 * a missing challenge or team, so a members-only community's hackathon is
 * not confirmed to exist.
 */

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { Where } from "payload";

import type { Challenge } from "@/payload-types";
import type { db as appDb } from "@/server/db";
import { challengeChannels, challengeThreads, teams } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { requireReadableContentOf } from "@/server/communities/content-access";
import { communityContentReadableWhere } from "@/server/communities/content-visibility";
import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";

type DB = typeof appDb;

const CHALLENGE_NOT_FOUND = "Challenge not found";

/** The challenge with this id, when the viewer may read its community. */
export async function requireReadableChallenge(
  db: DB,
  challengeId: number,
  userId: string | null | undefined,
): Promise<Challenge> {
  const payload = await getPayloadClient();
  const challenge = await payload.findByID({
    collection: "challenges",
    id: challengeId,
    depth: 0,
    disableErrors: true,
  });
  if (!challenge) {
    throw new TRPCError({ code: "NOT_FOUND", message: CHALLENGE_NOT_FOUND });
  }
  await requireReadableContentOf(db, challenge.communityId, userId, {
    notFound: CHALLENGE_NOT_FOUND,
  });
  return challenge;
}

/** A team's challenge id, when the viewer may read that challenge. */
export async function requireReadableTeam(
  db: DB,
  teamId: string,
  userId: string | null | undefined,
): Promise<{ challengeId: number }> {
  const [team] = await db
    .select({ challengeId: teams.challengeId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) throw new TRPCError({ code: "NOT_FOUND" });
  await requireReadableChallenge(db, team.challengeId, userId);
  return team;
}

/** A challenge channel's challenge, when the viewer may read it. */
export async function requireReadableChannel(
  db: DB,
  channelId: string,
  userId: string | null | undefined,
): Promise<{ challengeId: number }> {
  const [channel] = await db
    .select({ challengeId: challengeChannels.challengeId })
    .from(challengeChannels)
    .where(eq(challengeChannels.id, channelId))
    .limit(1);
  if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
  await requireReadableChallenge(db, channel.challengeId, userId);
  return channel;
}

/** A challenge-channel thread's challenge, when the viewer may read it. */
export async function requireReadableChannelThread(
  db: DB,
  threadId: string,
  userId: string | null | undefined,
): Promise<{ challengeId: number }> {
  const [row] = await db
    .select({ challengeId: challengeChannels.challengeId })
    .from(challengeThreads)
    .innerJoin(
      challengeChannels,
      eq(challengeChannels.id, challengeThreads.channelId),
    )
    .where(eq(challengeThreads.id, threadId))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
  }
  await requireReadableChallenge(db, row.challengeId, userId);
  return row;
}

/**
 * Payload `where` that drops challenges of communities the viewer may not
 * read; null when nothing is hidden. Hub-wide challenges stay.
 */
export async function readableChallengesWhere(
  db: DB,
  userId: string | null | undefined,
): Promise<Where | null> {
  return communityContentReadableWhere(
    await hiddenContentCommunityIds(db, userId),
  );
}
