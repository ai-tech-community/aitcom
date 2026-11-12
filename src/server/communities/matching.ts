import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import {
  communityConnectionTypes,
  communityMatchingProfiles,
  communityMemberships,
  introductions,
  memberProfiles,
  notifications,
  user,
} from "@/server/db/schema";
import {
  cleanMatchingAnswers,
  matchingPairKey,
  normalizeTopic,
  type ConnectionType,
  type MatchingProfile,
} from "@/lib/communities/matching";

type Database = typeof db;
type Reader = Pick<Database, "select">;

export function connectionTypes(database: Reader, communityId: string) {
  return database
    .select()
    .from(communityConnectionTypes)
    .where(eq(communityConnectionTypes.communityId, communityId))
    .orderBy(communityConnectionTypes.createdAt, communityConnectionTypes.id);
}

/** Only explicit, current community opt-ins. Never use the public directory. */
export function matchingParticipants(database: Reader, communityId: string) {
  return database
    .select({
      userId: communityMatchingProfiles.userId,
      displayName: sql<string>`coalesce(${memberProfiles.displayName}, ${user.name}, 'Member')`,
      image: user.image,
      optedIn: communityMatchingProfiles.optedIn,
      city: communityMatchingProfiles.city,
      languages: communityMatchingProfiles.languages,
      meeting: communityMatchingProfiles.meeting,
      answers: communityMatchingProfiles.answers,
    })
    .from(communityMatchingProfiles)
    .innerJoin(
      communityMemberships,
      and(
        eq(
          communityMemberships.communityId,
          communityMatchingProfiles.communityId,
        ),
        eq(communityMemberships.userId, communityMatchingProfiles.userId),
      ),
    )
    .innerJoin(user, eq(user.id, communityMatchingProfiles.userId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(
      and(
        eq(communityMatchingProfiles.communityId, communityId),
        eq(communityMatchingProfiles.optedIn, true),
        eq(communityMemberships.status, "active"),
      ),
    )
    .orderBy(communityMatchingProfiles.userId)
    .$dynamic();
}

/** Reject invented questions/options; silently discard answers to archived types. */
export function validateMatchingAnswers(
  profile: MatchingProfile,
  types: ConnectionType[],
) {
  // Withdrawing consent must work even if the questions changed while the
  // member's form was open. Retain only answers that still make sense.
  if (!profile.optedIn) return cleanMatchingAnswers(profile.answers, types);
  for (const [id, answer] of Object.entries(profile.answers)) {
    const type = types.find((t) => t.id === id);
    if (!type)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "MATCHING_QUESTIONS_CHANGED",
      });
    if (!type.active) continue;
    const allowed = new Set(type.topics.map(normalizeTopic));
    const values =
      type.mode === "shared"
        ? answer.interests
        : [...answer.offering, ...answer.seeking];
    if (values.some((v) => !allowed.has(normalizeTopic(v)))) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "MATCHING_QUESTIONS_CHANGED",
      });
    }
  }
  return cleanMatchingAnswers(profile.answers, types);
}

/** Consent requests and both notifications commit together; no outgoing mail. */
export async function proposeCommunityIntroduction(
  database: Database,
  input: {
    communityId: string;
    organizerId: string;
    userIdA: string;
    userIdB: string;
    reason: string;
    connectionTypeId?: string;
  },
) {
  if (input.userIdA === input.userIdB)
    throw new TRPCError({ code: "BAD_REQUEST", message: "MATCHING_SELF_PAIR" });
  const ids = [input.userIdA, input.userIdB].sort();
  try {
    return await database.transaction(async (tx) => {
      // Lock in consistent order. An opt-out or ban racing with proposal waits.
      const profiles = await tx
        .select()
        .from(communityMatchingProfiles)
        .where(
          and(
            eq(communityMatchingProfiles.communityId, input.communityId),
            inArray(communityMatchingProfiles.userId, ids),
            eq(communityMatchingProfiles.optedIn, true),
          ),
        )
        .orderBy(communityMatchingProfiles.userId)
        .for("update");
      const memberships = await tx
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, input.communityId),
            inArray(communityMemberships.userId, ids),
            eq(communityMemberships.status, "active"),
          ),
        )
        .orderBy(communityMemberships.userId)
        .for("update");
      if (profiles.length !== 2 || memberships.length !== 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MATCHING_MEMBERS_CHANGED",
        });
      }
      if (input.connectionTypeId) {
        const [type] = await tx
          .select()
          .from(communityConnectionTypes)
          .where(
            and(
              eq(communityConnectionTypes.id, input.connectionTypeId),
              eq(communityConnectionTypes.communityId, input.communityId),
              eq(communityConnectionTypes.active, true),
            ),
          )
          .for("share");
        if (!type)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MATCHING_QUESTIONS_CHANGED",
          });
      }
      const pairKey = matchingPairKey(ids[0]!, ids[1]!);
      const [existing] = await tx
        .select({ id: introductions.id })
        .from(introductions)
        .where(
          and(
            eq(introductions.communityId, input.communityId),
            eq(introductions.pairKey, pairKey),
            ne(introductions.status, "declined"),
          ),
        )
        .limit(1);
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "MATCHING_INTRO_EXISTS",
        });
      const [intro] = await tx
        .insert(introductions)
        .values({
          communityId: input.communityId,
          organizerId: input.organizerId,
          userIdA: ids[0]!,
          userIdB: ids[1]!,
          pairKey,
          reason: input.reason,
          connectionTypeId: input.connectionTypeId,
        })
        .onConflictDoNothing()
        .returning({ id: introductions.id });
      if (!intro)
        throw new TRPCError({
          code: "CONFLICT",
          message: "MATCHING_INTRO_EXISTS",
        });
      await tx.insert(notifications).values(
        ids.map((userId) => ({
          userId,
          type: "introduction_request" as const,
          title: "Someone would like to connect",
          content:
            "A community organizer thinks you'd hit it off with another member. Want to connect?",
          communityId: input.communityId,
          metadata: { introId: intro.id },
        })),
      );
      return { introId: intro.id };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "MATCHING_PROPOSE_FAILED",
      cause: error,
    });
  }
}
