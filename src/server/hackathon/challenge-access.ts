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
const CHANNEL_NOT_FOUND = "Channel not found";
const THREAD_NOT_FOUND = "Thread not found";
const TEAM_NOT_FOUND = "Team not found";

/** The NOT_FOUND message, so a hidden challenge answers like a missing row. */
type ChallengeGuardOptions = { notFound?: string };

/** The challenge with this id, when the viewer may read its community. */
export async function requireReadableChallenge(
  db: DB,
  challengeId: number,
  userId: string | null | undefined,
  options: ChallengeGuardOptions = {},
): Promise<Challenge> {
  const notFound = options.notFound ?? CHALLENGE_NOT_FOUND;
  const payload = await getPayloadClient();
  const challenge = await payload.findByID({
    collection: "challenges",
    id: challengeId,
    depth: 0,
    disableErrors: true,
  });
  if (!challenge) {
    throw new TRPCError({ code: "NOT_FOUND", message: notFound });
  }
  await requireReadableContentOf(db, challenge.communityId, userId, {
    notFound,
  });
  return challenge;
}

/**
 * The challenge, when the caller may take part in it: enroll, form or join
 * a team, post in its channel, report progress. Taking part follows the
 * challenge's event (ADR-0029, ADR-0050): on the Hub or a public community
 * anyone signed in may (public hackathons register non-members through the
 * event); in a members-only community only an active member in good
 * standing may, because only they may read it. Everyone else gets
 * NOT_FOUND, the same as a missing challenge. Checked on every action, not
 * only at enrollment: an enrollment made before a ban, or before a paid
 * membership lapsed, grants nothing by itself.
 */
export async function requireChallengeParticipant(
  db: DB,
  challengeId: number,
  userId: string,
  options: ChallengeGuardOptions = {},
): Promise<Challenge> {
  return requireReadableChallenge(db, challengeId, userId, options);
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
  if (!team) {
    throw new TRPCError({ code: "NOT_FOUND", message: TEAM_NOT_FOUND });
  }
  await requireReadableChallenge(db, team.challengeId, userId, {
    notFound: TEAM_NOT_FOUND,
  });
  return team;
}

/** The challenge a channel belongs to; NOT_FOUND for a missing channel. */
async function challengeOfChannel(
  db: DB,
  channelId: string,
): Promise<{ challengeId: number }> {
  const [channel] = await db
    .select({ challengeId: challengeChannels.challengeId })
    .from(challengeChannels)
    .where(eq(challengeChannels.id, channelId))
    .limit(1);
  if (!channel) {
    throw new TRPCError({ code: "NOT_FOUND", message: CHANNEL_NOT_FOUND });
  }
  return channel;
}

/** The challenge a channel thread belongs to; NOT_FOUND for a missing one. */
async function challengeOfChannelThread(
  db: DB,
  threadId: string,
): Promise<{ challengeId: number; type: string }> {
  const [row] = await db
    .select({
      challengeId: challengeChannels.challengeId,
      type: challengeThreads.type,
    })
    .from(challengeThreads)
    .innerJoin(
      challengeChannels,
      eq(challengeChannels.id, challengeThreads.channelId),
    )
    .where(eq(challengeThreads.id, threadId))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: THREAD_NOT_FOUND });
  }
  return row;
}

/** A challenge channel's challenge, when the viewer may read it. */
export async function requireReadableChannel(
  db: DB,
  channelId: string,
  userId: string | null | undefined,
): Promise<{ challengeId: number }> {
  const channel = await challengeOfChannel(db, channelId);
  await requireReadableChallenge(db, channel.challengeId, userId, {
    notFound: CHANNEL_NOT_FOUND,
  });
  return channel;
}

/** A challenge-channel thread's challenge, when the viewer may read it. */
export async function requireReadableChannelThread(
  db: DB,
  threadId: string,
  userId: string | null | undefined,
): Promise<{ challengeId: number; type: string }> {
  const row = await challengeOfChannelThread(db, threadId);
  await requireReadableChallenge(db, row.challengeId, userId, {
    notFound: THREAD_NOT_FOUND,
  });
  return row;
}

/** A channel the caller may post in (`requireChallengeParticipant`). */
export async function requireChannelParticipant(
  db: DB,
  channelId: string,
  userId: string,
): Promise<{ challengeId: number }> {
  const channel = await challengeOfChannel(db, channelId);
  await requireChallengeParticipant(db, channel.challengeId, userId, {
    notFound: CHANNEL_NOT_FOUND,
  });
  return channel;
}

/** A channel thread the caller may reply to (`requireChallengeParticipant`). */
export async function requireChannelThreadParticipant(
  db: DB,
  threadId: string,
  userId: string,
): Promise<{ challengeId: number; type: string }> {
  const row = await challengeOfChannelThread(db, threadId);
  await requireChallengeParticipant(db, row.challengeId, userId, {
    notFound: THREAD_NOT_FOUND,
  });
  return row;
}

/**
 * A team the caller may act on (join, leave, disband, submit): the team
 * row when they may take part in its challenge. A missing team and one of
 * a challenge they may not read both answer "Team not found".
 */
export async function requireTeamParticipant<T extends { challengeId: number }>(
  db: DB,
  team: T | undefined,
  userId: string,
): Promise<T> {
  if (!team) {
    throw new TRPCError({ code: "NOT_FOUND", message: TEAM_NOT_FOUND });
  }
  await requireChallengeParticipant(db, team.challengeId, userId, {
    notFound: TEAM_NOT_FOUND,
  });
  return team;
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
