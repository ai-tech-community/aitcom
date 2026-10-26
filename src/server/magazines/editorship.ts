import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";
import { communityMemberships } from "@/server/db/schema";

import { activeCommunityRole, activeRoleOf } from "./viewer-role";

/**
 * The one editorship seam (ADR-0042): who edits a magazine and who is a
 * member of its community. Every editor gate (the read resolver, the
 * reading pages, the editor pages, the editor API, the read scope) asks
 * these loaders and nothing else.
 *
 * Slice 1 derives both from the community membership: an active owner or
 * admin edits the magazine, any active member reads members-only issues;
 * moderators are readers. Slice 3 (per-magazine staff roles) changes the
 * two loaders below and no caller: callers never see a community role.
 */

/** The viewer's standing in one magazine. */
export type MagazineStanding = {
  /** Edits the magazine: sees drafts and every issue, may write. */
  isEditor: boolean;
  /** An active member of the magazine's community. */
  isMember: boolean;
};

/**
 * The magazine a standing is about. `magazineId` is null for a community
 * that has no magazine yet (whoever would edit it may start one).
 */
export type MagazineRef = { communityId: string; magazineId: number | null };

/** No standing at all: anonymous, not a member, or no live community. */
export const NO_STANDING: MagazineStanding = {
  isEditor: false,
  isMember: false,
};

const EDITOR_ROLES: ReadonlySet<CommunityRole> = new Set(["owner", "admin"]);

/** Slice 1's rule: the standing an active community role (or none) gives. */
function standingOfRole(role: CommunityRole | null): MagazineStanding {
  return {
    isEditor: role !== null && EDITOR_ROLES.has(role),
    isMember: role !== null,
  };
}

/**
 * The viewer's standing in a magazine. It does not look at the community
 * itself: callers decide what a missing or soft-deleted community means.
 */
export async function loadMagazineEditorship(
  database: typeof db,
  magazine: MagazineRef,
  userId: string | null,
): Promise<MagazineStanding> {
  if (userId === null) return NO_STANDING;
  return standingOfRole(
    await activeCommunityRole(database, magazine.communityId, userId),
  );
}

/** The gate for every magazine editing procedure: non-editors get FORBIDDEN. */
export function requireEditorStanding(standing: MagazineStanding): void {
  if (!standing.isEditor) throw new TRPCError({ code: "FORBIDDEN" });
}

/**
 * The viewer's standing across all magazines, as community ids (one
 * magazine per community), for the read scope's query twin.
 */
export type EditorScope = {
  /** Communities whose magazine the viewer edits. */
  editorCommunityIds: string[];
  /** Communities the viewer is an active member of. */
  memberCommunityIds: string[];
};

/** The pure half of `loadEditorScope`, over membership rows. */
export function editorScopeOf(
  memberships: readonly {
    communityId: string;
    role: CommunityRole;
    status: string;
  }[],
): EditorScope {
  const scope: EditorScope = { editorCommunityIds: [], memberCommunityIds: [] };
  for (const membership of memberships) {
    const standing = standingOfRole(activeRoleOf(membership));
    if (standing.isEditor) {
      scope.editorCommunityIds.push(membership.communityId);
    }
    if (standing.isMember) {
      scope.memberCommunityIds.push(membership.communityId);
    }
  }
  return scope;
}

/** Batched `loadMagazineEditorship` over every magazine: one query. */
export async function loadEditorScope(
  database: typeof db,
  userId: string | null,
): Promise<EditorScope> {
  if (userId === null) return editorScopeOf([]);
  const memberships = await database
    .select({
      communityId: communityMemberships.communityId,
      role: communityMemberships.role,
      status: communityMemberships.status,
    })
    .from(communityMemberships)
    .where(eq(communityMemberships.userId, userId));
  return editorScopeOf(memberships);
}
