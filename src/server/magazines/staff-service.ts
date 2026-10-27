import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import {
  COMMUNITY_LEADER_ROLE,
  MAGAZINE_ROLES,
  type MagazineRole,
} from "@/lib/magazines/roles";
import { escapeLike } from "@/server/db/escape-like";
import {
  communityMemberships,
  magazineStaff,
  memberProfiles,
  user,
} from "@/server/db/schema";

import type { Deps } from "./deps";
import { LEADING_COMMUNITY_ROLES, leadsCommunity } from "./editorship";
import { magazineError } from "./errors";
import { notifyRoleAssigned, type NoticeCommunity } from "./notifications";
import { activeRoleOf } from "./viewer-role";

export const STAFF_SEARCH_LIMIT = 10;

export type StaffMember = {
  userId: string;
  name: string;
  image: string | null;
  role: MagazineRole;
  source: (typeof LEADING_COMMUNITY_ROLES)[number] | "assigned";
  isActiveMember: boolean;
  isViewer: boolean;
};
export type StaffMagazine = { id: number; name: string; communityId: string };
export type StaffCandidate = {
  userId: string;
  name: string;
  image: string | null;
};

const personFields = {
  userId: user.id,
  name: sql<string>`coalesce(${memberProfiles.displayName}, ${user.name})`,
  image: user.image,
};
const membershipFields = {
  role: communityMemberships.role,
  status: communityMemberships.status,
};

/** Leaders come first; assignments survive a member leaving but grant nothing. */
export async function listMagazineStaff(
  database: Deps["db"],
  magazine: StaffMagazine,
  viewerId: string,
): Promise<StaffMember[]> {
  const [leaders, assigned] = await Promise.all([
    database
      .select({ ...personFields, communityRole: communityMemberships.role })
      .from(communityMemberships)
      .innerJoin(user, eq(user.id, communityMemberships.userId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
      .where(
        and(
          eq(communityMemberships.communityId, magazine.communityId),
          eq(communityMemberships.status, "active"),
          inArray(communityMemberships.role, [...LEADING_COMMUNITY_ROLES]),
        ),
      ),
    database
      .select({
        ...personFields,
        role: magazineStaff.role,
        membership: membershipFields,
      })
      .from(magazineStaff)
      .innerJoin(user, eq(user.id, magazineStaff.userId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
      .leftJoin(
        communityMemberships,
        and(
          eq(communityMemberships.userId, user.id),
          eq(communityMemberships.communityId, magazine.communityId),
        ),
      )
      .where(eq(magazineStaff.magazineId, magazine.id)),
  ]);
  const implicit: StaffMember[] = leaders.flatMap(
    ({ communityRole, ...person }) =>
      leadsCommunity(communityRole)
        ? [
            {
              ...person,
              role: COMMUNITY_LEADER_ROLE,
              source: communityRole,
              isActiveMember: true,
              isViewer: person.userId === viewerId,
            },
          ]
        : [],
  );
  implicit.sort(
    (a, b) =>
      LEADING_COMMUNITY_ROLES.indexOf(
        a.source as (typeof LEADING_COMMUNITY_ROLES)[number],
      ) -
        LEADING_COMMUNITY_ROLES.indexOf(
          b.source as (typeof LEADING_COMMUNITY_ROLES)[number],
        ) || a.name.localeCompare(b.name),
  );
  const team: StaffMember[] = assigned.flatMap(({ membership, ...person }) => {
    const communityRole = activeRoleOf(membership);
    if (leadsCommunity(communityRole)) return [];
    return [
      {
        ...person,
        source: "assigned",
        isActiveMember: communityRole !== null,
        isViewer: person.userId === viewerId,
      },
    ];
  });
  team.sort(
    (a, b) =>
      MAGAZINE_ROLES.indexOf(a.role) - MAGAZINE_ROLES.indexOf(b.role) ||
      a.name.localeCompare(b.name),
  );
  return [...implicit, ...team];
}

/** Literal name search among active members who have no assignment. */
export async function searchStaffCandidates(
  database: Deps["db"],
  magazine: StaffMagazine,
  query: string,
): Promise<StaffCandidate[]> {
  const pattern = `%${escapeLike(query.trim())}%`;
  return database
    .select(personFields)
    .from(communityMemberships)
    .innerJoin(user, eq(user.id, communityMemberships.userId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .leftJoin(
      magazineStaff,
      and(
        eq(magazineStaff.magazineId, magazine.id),
        eq(magazineStaff.userId, user.id),
      ),
    )
    .where(
      and(
        eq(communityMemberships.communityId, magazine.communityId),
        eq(communityMemberships.status, "active"),
        notInArray(communityMemberships.role, [...LEADING_COMMUNITY_ROLES]),
        isNull(magazineStaff.userId),
        or(
          ilike(memberProfiles.displayName, pattern),
          ilike(user.name, pattern),
        ),
      ),
    )
    .orderBy(asc(personFields.name), asc(user.id))
    .limit(STAFF_SEARCH_LIMIT);
}

/** A conditional upsert decides whether the job changed, including racing calls. */
export async function assignMagazineRole(
  database: Deps["db"],
  magazine: StaffMagazine,
  input: { userId: string; role: MagazineRole },
  actor: { userId: string; community: NoticeCommunity },
): Promise<StaffMember> {
  const [person] = await database
    .select({ ...personFields, membership: membershipFields })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .leftJoin(
      communityMemberships,
      and(
        eq(communityMemberships.userId, user.id),
        eq(communityMemberships.communityId, magazine.communityId),
      ),
    )
    .where(eq(user.id, input.userId));
  const communityRole = activeRoleOf(person?.membership);
  if (!person || communityRole === null)
    throw magazineError("STAFF_NOT_MEMBER");
  if (leadsCommunity(communityRole))
    throw magazineError("STAFF_LEADS_COMMUNITY");

  const [changed] = await database
    .insert(magazineStaff)
    .values({
      magazineId: magazine.id,
      communityId: magazine.communityId,
      userId: input.userId,
      role: input.role,
      assignedBy: actor.userId,
    })
    .onConflictDoUpdate({
      target: [magazineStaff.magazineId, magazineStaff.userId],
      set: {
        role: sql`excluded.role`,
        assignedBy: sql`excluded.assigned_by`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${magazineStaff.role} IS DISTINCT FROM excluded.role`,
    })
    .returning();

  if (changed)
    await notifyRoleAssigned(database, {
      userId: input.userId,
      role: changed.role,
      magazineName: magazine.name,
      community: actor.community,
    });
  const current =
    changed ??
    (await database.query.magazineStaff.findFirst({
      where: and(
        eq(magazineStaff.magazineId, magazine.id),
        eq(magazineStaff.userId, input.userId),
      ),
    }));
  if (!current) throw new TRPCError({ code: "NOT_FOUND" });
  return {
    userId: person.userId,
    name: person.name,
    image: person.image,
    role: current.role,
    source: "assigned",
    isActiveMember: true,
    isViewer: person.userId === actor.userId,
  };
}

/** Removing a missing assignment is already a success. */
export async function removeMagazineRole(
  database: Deps["db"],
  magazine: Pick<StaffMagazine, "id">,
  userId: string,
): Promise<void> {
  await database
    .delete(magazineStaff)
    .where(
      and(
        eq(magazineStaff.magazineId, magazine.id),
        eq(magazineStaff.userId, userId),
      ),
    );
}
