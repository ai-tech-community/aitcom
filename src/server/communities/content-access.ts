/**
 * The tRPC guards over the read seam (./content-visibility-queries): every
 * procedure that reads or writes a community's content, or acts as one of
 * its members, asks one of these instead of looking memberships up itself,
 * so the rule and the answer an outsider gets live in one place
 * (ADR-0050).
 *
 * - Someone who may not read a community's content gets NOT_FOUND, the
 *   same answer as a missing row, so a members-only community (and what
 *   is in it) is not confirmed to exist.
 * - A write needs an active member whose paid membership is in order
 *   (`activeCommunityRole`). Someone who may read but is not such a member
 *   gets FORBIDDEN: they can already see the content, so the refusal tells
 *   them nothing new.
 * - Content with no community (legacy Hub-wide rows) has no members: any
 *   signed-in user may read and write it, as before.
 */

import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { communities } from "@/server/db/schema";

import {
  activeCommunityRole,
  COMMUNITY_VISIBILITY_COLUMNS,
  communityStanding,
  viewerCanReadContent,
  viewerCanReadRoster,
  type CommunityRef,
} from "./content-visibility-queries";
import { isOnTheWayIn } from "./content-visibility";
import type { CommunityRole } from "./role-utils";

type DB = typeof _db;

/** Neutral on purpose: the same refusal covers posting, voting and acting. */
export const NOT_AN_ACTIVE_MEMBER = "Must be an active community member";

/** A community and the caller's active role in it. */
export type ActiveCommunityMember = CommunityRef & { role: CommunityRole };

type GuardOptions = {
  /** The NOT_FOUND message, so a hidden row answers like a missing one. */
  notFound?: string;
};

function notFound(options: GuardOptions): TRPCError {
  return new TRPCError({
    code: "NOT_FOUND",
    ...(options.notFound ? { message: options.notFound } : {}),
  });
}

/** The live community with this slug, with its visibility facts. */
async function liveCommunityBySlug(
  db: DB,
  slug: string,
): Promise<CommunityRef | null> {
  return (
    (await db.query.communities.findFirst({
      where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
      columns: COMMUNITY_VISIBILITY_COLUMNS,
    })) ?? null
  );
}

/** The live community with this id, with its visibility facts. */
async function liveCommunityById(
  db: DB,
  id: string,
): Promise<CommunityRef | null> {
  return (
    (await db.query.communities.findFirst({
      where: and(eq(communities.id, id), isNull(communities.deletedAt)),
      columns: COMMUNITY_VISIBILITY_COLUMNS,
    })) ?? null
  );
}

/** NOT_FOUND unless the viewer may read the community's content. */
export async function requireReadableCommunity(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<void> {
  if (!(await viewerCanReadContent(db, community, userId))) {
    throw notFound(options);
  }
}

/**
 * The live community with this slug, when the viewer may read its content.
 * Missing, deleted and unreadable all answer NOT_FOUND.
 */
export async function requireReadableCommunityBySlug(
  db: DB,
  slug: string,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<CommunityRef> {
  const community = await liveCommunityBySlug(db, slug);
  if (!community) throw notFound(options);
  await requireReadableCommunity(db, community, userId, options);
  return community;
}

/**
 * The live community with this slug, when the viewer may read its roster
 * (member list, faces, counts). Missing, deleted and unreadable all answer
 * NOT_FOUND.
 */
export async function requireReadableRosterBySlug(
  db: DB,
  slug: string,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<CommunityRef> {
  const community = await liveCommunityBySlug(db, slug);
  if (!community) throw notFound(options);
  if (!(await viewerCanReadRoster(db, community, userId))) {
    throw notFound(options);
  }
  return community;
}

/**
 * NOT_FOUND unless the viewer may read a row scoped to `communityId`
 * (forum thread, idea, challenge, project). A null id is Hub-wide content:
 * readable by anyone. A soft-deleted community's content stays readable
 * by the same rule, as `viewerCanReadContentOf` reads it.
 */
export async function requireReadableContentOf(
  db: DB,
  communityId: string | null | undefined,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<void> {
  if (!communityId) return;
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
    columns: COMMUNITY_VISIBILITY_COLUMNS,
  });
  if (!community) throw notFound(options);
  await requireReadableCommunity(db, community, userId, options);
}

/**
 * The caller's role, when they are an active member in good standing.
 * Otherwise NOT_FOUND when they may not read the community (so the write
 * does not confirm it exists), FORBIDDEN when they may.
 */
export async function requireActiveMember(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<CommunityRole> {
  const role = await activeCommunityRole(db, community.id, userId);
  if (role) return role as CommunityRole;
  if (!(await viewerCanReadContent(db, community, userId))) {
    throw notFound(options);
  }
  throw new TRPCError({ code: "FORBIDDEN", message: NOT_AN_ACTIVE_MEMBER });
}

/** `requireActiveMember` for the live community with this slug. */
export async function requireActiveMemberBySlug(
  db: DB,
  slug: string,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<ActiveCommunityMember> {
  const community = await liveCommunityBySlug(db, slug);
  if (!community) throw notFound(options);
  const role = await requireActiveMember(db, community, userId, options);
  return { ...community, role };
}

/**
 * `requireActiveMember` for the community a row is scoped to. A null id is
 * Hub-wide content, open to any signed-in user: the answer is null. A
 * missing or deleted community is NOT_FOUND.
 */
export async function requireActiveMemberOf(
  db: DB,
  communityId: string | null | undefined,
  userId: string | null | undefined,
  options: GuardOptions = {},
): Promise<ActiveCommunityMember | null> {
  if (!communityId) return null;
  const community = await liveCommunityById(db, communityId);
  if (!community) throw notFound(options);
  const role = await requireActiveMember(db, community, userId, options);
  return { ...community, role };
}

/**
 * The live community with this slug, when the viewer may read its rules:
 * whoever may read its content, and whoever is on the way in (an open
 * invitation, a pending request), who should know the rules before they
 * accept. Everyone else gets NOT_FOUND.
 */
export async function requireJoinTermsReader(
  db: DB,
  slug: string,
  userId: string | null | undefined,
): Promise<CommunityRef> {
  const community = await liveCommunityBySlug(db, slug);
  if (!community) throw notFound({});
  if (await viewerCanReadContent(db, community, userId)) return community;
  const { status } = await communityStanding(db, community.id, userId);
  if (!isOnTheWayIn(status)) throw notFound({});
  return community;
}
