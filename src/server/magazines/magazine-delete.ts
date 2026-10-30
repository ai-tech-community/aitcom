import { TRPCError } from "@trpc/server";
import type { CollectionConfig } from "payload";
import { and, asc, eq } from "drizzle-orm";

import { Articles } from "@/collections/Articles";
import { MagazineIssues } from "@/collections/MagazineIssues";
import { agentDrafts, communityMemberships } from "@/server/db/schema";

import { assertArticleNotPlaced } from "./article-placement";
import type { Deps } from "./deps";
import {
  type DeletableCollection,
  deletionMode,
  softDeleteData,
} from "./deletion-mode";
import {
  COMMUNITY_OWNER_ROLE,
  loadMagazineEditorship,
  standingCan,
} from "./editorship";

/** A delete the community owner must approve. Nothing is removed until then. */
export const MAGAZINE_DELETE_DRAFT_TYPE = "delete";

export type MagazineDeleteTarget = {
  collection: DeletableCollection;
  id: number;
  communityId: string;
};

async function communityOwnerId(
  db: Deps["db"],
  communityId: string,
): Promise<string> {
  const [row] = await db
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.role, COMMUNITY_OWNER_ROLE),
        eq(communityMemberships.status, "active"),
      ),
    )
    .orderBy(asc(communityMemberships.joinedAt))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This community has no owner to approve the deletion.",
    });
  }
  return row.userId;
}

/**
 * Queue a delete. The row stays until the community owner approves the draft.
 */
export async function proposeMagazineDelete(
  deps: Deps,
  identity: { agentId: string; ownerId: string },
  input: {
    collection: DeletableCollection;
    id: number;
    magazineId: number;
    magazineSlug: string;
    communityId: string;
    communitySlug: string;
    title: string;
  },
): Promise<{ draftId: string; review: "pending" }> {
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: input.communityId, magazineId: input.magazineId },
    identity.ownerId,
  );
  if (!standingCan(standing, "edit")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only a magazine editor can propose deleting an issue or article. The community owner approves that delete.",
    });
  }
  const ownerId = await communityOwnerId(deps.db, input.communityId);
  const draftId = crypto.randomUUID();
  const noun = input.collection === "articles" ? "article" : "issue";
  await deps.db.insert(agentDrafts).values({
    id: draftId,
    agentId: identity.agentId,
    ownerId,
    type: MAGAZINE_DELETE_DRAFT_TYPE,
    targetType: input.collection,
    targetId: String(input.id),
    status: "pending",
    content: input.title,
    metadata: {
      kind: "delete",
      collection: input.collection,
      id: input.id,
      communityId: input.communityId,
      magazineId: input.magazineId,
      magazineSlug: input.magazineSlug,
      title: input.title,
      destinationLabel: `Delete ${noun}: ${input.title}`,
      destinationPath: `/communities/${input.communitySlug}/magazine`,
    },
  });
  return { draftId, review: "pending" };
}

export function magazineDeleteFromDraft(draft: {
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
}): MagazineDeleteTarget {
  const meta =
    draft.metadata && typeof draft.metadata === "object"
      ? (draft.metadata as Record<string, unknown>)
      : null;
  const collection = meta?.collection ?? draft.targetType;
  const id = typeof meta?.id === "number" ? meta.id : Number(draft.targetId);
  const communityId = meta?.communityId;
  if (collection !== "articles" && collection !== "magazine-issues") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This delete draft has no document.",
    });
  }
  if (!Number.isInteger(id) || id <= 0 || typeof communityId !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This delete draft has no document.",
    });
  }
  return { collection, id, communityId };
}

function namesOf(collection: CollectionConfig): string[] {
  return collection.fields.flatMap((field) =>
    "name" in field && field.name ? [field.name] : [],
  );
}

/** Apply an approved delete. Soft when the collection has a deleted flag. */
export async function applyApprovedMagazineDelete(
  payload: Deps["payload"],
  target: MagazineDeleteTarget,
): Promise<"soft" | "hard"> {
  const config = target.collection === "articles" ? Articles : MagazineIssues;
  const names = namesOf(config);
  const mode = deletionMode(names);
  if (mode === "soft") {
    await payload.update({
      collection: target.collection,
      id: target.id,
      depth: 0,
      data: softDeleteData(names, new Date().toISOString()) as never,
    });
    return "soft";
  }
  if (target.collection === "articles") {
    await assertArticleNotPlaced(payload, target.id);
  }
  await payload.delete({
    collection: target.collection,
    id: target.id,
  });
  return "hard";
}
