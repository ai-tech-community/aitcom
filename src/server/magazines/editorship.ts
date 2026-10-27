import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, or } from "drizzle-orm";

import {
  COMMUNITY_LEADER_ROLE,
  type MagazineCapability,
  type MagazineRole,
  roleCan,
  rolesWith,
} from "@/lib/magazines/roles";
import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";
import { communityMemberships, magazineStaff } from "@/server/db/schema";

import { activeCommunityRole, activeRoleOf } from "./viewer-role";

/**
 * The one editorship seam (ADR-0042): a viewer's magazine capabilities and
 * community membership. Slice 3 is here: this is the only reader of
 * app.magazine_staff for standing, including the batched read scope and
 * editor notifications. Staff roles count only for active members.
 *
 * ADR-0045 amends ADR-0042's "no caller changes": callers now ask for
 * capabilities; isEditor keeps its meaning for every reading surface.
 */

/** The viewer's standing in one magazine. */
export type MagazineStanding = {
  /** For display only (which desk, which job name). Gates use standingCan. */
  role: MagazineRole | null;
  /** Edits the magazine: sees drafts and every issue, may write. */
  isEditor: boolean;
  /** An active member of the magazine's community. */
  isMember: boolean;
  /** Active community owner/admin: may confirm public in an unlisted community. */
  leadsCommunity: boolean;
};

/**
 * The magazine a standing is about. `magazineId` is null for a community
 * that has no magazine yet (whoever would edit it may start one).
 */
export type MagazineRef = { communityId: string; magazineId: number | null };

/** No standing at all: anonymous, not a member, or no live community. */
export const NO_STANDING: MagazineStanding = {
  role: null,
  isEditor: false,
  isMember: false,
  leadsCommunity: false,
};

/** The one community leadership rule for magazines, also used by SQL filters. */
export const LEADING_COMMUNITY_ROLES = [
  "owner",
  "admin",
] as const satisfies readonly CommunityRole[];

export function leadsCommunity(
  communityRole: CommunityRole | null,
): communityRole is (typeof LEADING_COMMUNITY_ROLES)[number] {
  return (
    communityRole !== null &&
    (LEADING_COMMUNITY_ROLES as readonly CommunityRole[]).includes(
      communityRole,
    )
  );
}

/** The standing an active community role and an optional staff role grant. */
export function standingOf(
  communityRole: CommunityRole | null,
  staffRole: MagazineRole | null,
): MagazineStanding {
  if (communityRole === null) return NO_STANDING;
  const leads = leadsCommunity(communityRole);
  const role = leads ? COMMUNITY_LEADER_ROLE : staffRole;
  return {
    role,
    isEditor: roleCan(role, "edit"),
    isMember: true,
    leadsCommunity: leads,
  };
}

export function standingCan(
  standing: MagazineStanding,
  capability: MagazineCapability,
): boolean {
  return roleCan(standing.role, capability);
}

export function requireCapability(
  standing: MagazineStanding,
  capability: MagazineCapability,
): void {
  if (!standingCan(standing, capability))
    throw new TRPCError({ code: "FORBIDDEN" });
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
  const [communityRole, staff] = await Promise.all([
    activeCommunityRole(database, magazine.communityId, userId),
    magazine.magazineId === null
      ? undefined
      : database.query.magazineStaff.findFirst({
          where: and(
            eq(magazineStaff.magazineId, magazine.magazineId),
            eq(magazineStaff.userId, userId),
          ),
          columns: { role: true },
        }),
  ]);
  return standingOf(communityRole, staff?.role ?? null);
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

export type StaffRoleRow = { communityId: string; role: MagazineRole };

/** The pure half of `loadEditorScope`, over memberships and staff rows. */
export function editorScopeOf(
  memberships: readonly {
    communityId: string;
    role: CommunityRole;
    status: string;
  }[],
  staff: readonly StaffRoleRow[] = [],
): EditorScope {
  const rolesByCommunity = new Map(
    staff.map((row) => [row.communityId, row.role]),
  );
  const scope: EditorScope = { editorCommunityIds: [], memberCommunityIds: [] };
  for (const membership of memberships) {
    const standing = standingOf(
      activeRoleOf(membership),
      rolesByCommunity.get(membership.communityId) ?? null,
    );
    if (standing.isEditor) {
      scope.editorCommunityIds.push(membership.communityId);
    }
    if (standing.isMember) {
      scope.memberCommunityIds.push(membership.communityId);
    }
  }
  return scope;
}

/** Batched `loadMagazineEditorship`: memberships and staff load in parallel. */
export async function loadEditorScope(
  database: typeof db,
  userId: string | null,
): Promise<EditorScope> {
  if (userId === null) return editorScopeOf([], []);
  const [memberships, staff] = await Promise.all([
    database
      .select({
        communityId: communityMemberships.communityId,
        role: communityMemberships.role,
        status: communityMemberships.status,
      })
      .from(communityMemberships)
      .where(eq(communityMemberships.userId, userId)),
    database
      .select({
        communityId: magazineStaff.communityId,
        role: magazineStaff.role,
      })
      .from(magazineStaff)
      .where(eq(magazineStaff.userId, userId)),
  ]);
  return editorScopeOf(memberships, staff);
}

/** Active community leaders and staff with edit, unique and sorted for notices. */
export async function listMagazineEditorIds(
  database: typeof db,
  magazine: { communityId: string; magazineId: number },
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .leftJoin(
      magazineStaff,
      and(
        eq(magazineStaff.magazineId, magazine.magazineId),
        eq(magazineStaff.userId, communityMemberships.userId),
        eq(magazineStaff.communityId, communityMemberships.communityId),
      ),
    )
    .where(
      and(
        eq(communityMemberships.communityId, magazine.communityId),
        eq(communityMemberships.status, "active"),
        or(
          inArray(communityMemberships.role, [...LEADING_COMMUNITY_ROLES]),
          inArray(magazineStaff.role, [...rolesWith("edit")]),
        ),
      ),
    )
    .orderBy(asc(communityMemberships.userId));
  return rows.map((row) => row.userId);
}
