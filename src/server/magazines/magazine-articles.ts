import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { Where } from "payload";

import type { Magazine } from "@/payload-types";
import type { CommunityRole } from "@/server/communities/role-utils";
import { communities, communityMemberships } from "@/server/db/schema";

import type { Deps, PayloadClient } from "./deps";
import { isMagazineEditorRole } from "./issue-access";
import { relationIdOrNull } from "./relation-id";

/**
 * Magazine articles from the editor's side (ADR-0043): who may write them,
 * and the editor lists of them. These lists are editor surfaces, never
 * reader surfaces: they show drafts and unpublished articles on purpose.
 */

/** An approved article an editor can still place in an issue. */
export type AvailableMagazineArticle = {
  id: number;
  title: string;
  authorName: string | null;
  updatedAt: string;
};

/** One of the editor's own magazine articles that is not ready yet. */
export type DraftMagazineArticle = {
  id: number;
  slug: string;
  title: string;
  reviewStatus: string | null;
  updatedAt: string;
};

/** Most articles an editor list returns. */
const EDITOR_LIST_LIMIT = 100;

async function activeRoleIn(
  database: Deps["db"],
  communityId: string,
  userId: string,
): Promise<CommunityRole | null> {
  const community = await database.query.communities.findFirst({
    where: and(eq(communities.id, communityId), isNull(communities.deletedAt)),
    columns: { id: true },
  });
  if (!community) return null;
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
    ),
    columns: { role: true, status: true },
  });
  return membership?.status === "active" ? membership.role : null;
}

/**
 * The magazine a user writes for, when they are an editor of its
 * community (an active owner or admin of a live community, today).
 * `NOT_FOUND` when the magazine does not exist, `FORBIDDEN` when the user
 * is not its editor. The one gate for writing magazine articles.
 */
export async function requireEditorOfMagazine(
  deps: Deps,
  magazine: unknown,
  userId: string,
): Promise<Magazine> {
  const magazineId = relationIdOrNull(magazine);
  const doc =
    magazineId === null
      ? null
      : await deps.payload.findByID({
          collection: "magazines",
          id: magazineId,
          depth: 0,
          disableErrors: true,
        });
  if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
  const role = await activeRoleIn(deps.db, doc.communityId, userId);
  if (!isMagazineEditorRole(role)) throw new TRPCError({ code: "FORBIDDEN" });
  return doc;
}

/**
 * Approved articles of the magazine that no issue holds yet, newest first.
 * Read from the latest versions, so titles are what the author last saved.
 */
export async function listAvailableArticles(
  payload: PayloadClient,
  magazineId: number,
): Promise<AvailableMagazineArticle[]> {
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { magazine: { equals: magazineId } },
        { reviewStatus: { equals: "approved" } },
        { magazineIssue: { exists: false } },
      ],
    },
    sort: "-updatedAt",
    depth: 0,
    draft: true,
    limit: EDITOR_LIST_LIMIT,
    pagination: false,
  });
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    authorName: doc.authorName ?? null,
    updatedAt: doc.updatedAt,
  }));
}

/** Not approved: never submitted (null), sent back, or refused. */
const NOT_READY: Where = {
  or: [
    { reviewStatus: { exists: false } },
    { reviewStatus: { not_equals: "approved" } },
  ],
};

/** The author's articles for the magazine that are not ready yet. */
export async function listDraftArticles(
  payload: PayloadClient,
  magazineId: number,
  authorId: string,
): Promise<DraftMagazineArticle[]> {
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { magazine: { equals: magazineId } },
        { authorId: { equals: authorId } },
        NOT_READY,
      ],
    },
    sort: "-updatedAt",
    depth: 0,
    draft: true,
    limit: EDITOR_LIST_LIMIT,
    pagination: false,
  });
  return docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    reviewStatus: doc.reviewStatus ?? null,
    updatedAt: doc.updatedAt,
  }));
}
