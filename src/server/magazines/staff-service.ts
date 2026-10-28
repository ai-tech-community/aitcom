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
  agentProfiles,
  communityMemberships,
  magazineAgentStaff,
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
  /** Set when this row is a member's agent, not the member. */
  agentId?: string;
  /** The human this agent belongs to. */
  agentOf?: string;
};
export type StaffMagazine = { id: number; name: string; communityId: string };
export type StaffCandidate = {
  userId: string;
  name: string;
  image: string | null;
  /** Set when the row is a member's agent. `userId` is that member. */
  agentId?: string;
  ownerName?: string;
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
  const agents = await database
    .select({
      agentId: magazineAgentStaff.agentId,
      role: magazineAgentStaff.role,
      name: agentProfiles.name,
      image: agentProfiles.avatar,
      ownerId: magazineAgentStaff.ownerId,
      ownerName: personFields.name,
      membership: membershipFields,
    })
    .from(magazineAgentStaff)
    .innerJoin(agentProfiles, eq(agentProfiles.id, magazineAgentStaff.agentId))
    .innerJoin(user, eq(user.id, magazineAgentStaff.ownerId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .leftJoin(
      communityMemberships,
      and(
        eq(communityMemberships.userId, magazineAgentStaff.ownerId),
        eq(communityMemberships.communityId, magazine.communityId),
      ),
    )
    .where(eq(magazineAgentStaff.magazineId, magazine.id));
  const agentTeam: StaffMember[] = agents.flatMap((row) => {
    if (!row.ownerId) return [];
    const communityRole = activeRoleOf(row.membership);
    return [
      {
        userId: row.ownerId,
        name: row.name,
        image: row.image,
        role: row.role,
        source: "assigned" as const,
        isActiveMember: communityRole !== null,
        isViewer: false,
        agentId: row.agentId,
        agentOf: row.ownerName,
      },
    ];
  });
  agentTeam.sort(
    (a, b) =>
      MAGAZINE_ROLES.indexOf(a.role) - MAGAZINE_ROLES.indexOf(b.role) ||
      a.name.localeCompare(b.name),
  );
  return [...implicit, ...team, ...agentTeam];
}

/** Literal name search among active members who have no assignment, and their agents. */
export async function searchStaffCandidates(
  database: Deps["db"],
  magazine: StaffMagazine,
  query: string,
): Promise<StaffCandidate[]> {
  const pattern = `%${escapeLike(query.trim())}%`;
  const [people, agents] = await Promise.all([
    database
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
      .limit(STAFF_SEARCH_LIMIT),
    database
      .select({
        userId: agentProfiles.ownerId,
        agentId: agentProfiles.id,
        name: agentProfiles.name,
        image: agentProfiles.avatar,
        ownerName: personFields.name,
      })
      .from(agentProfiles)
      .innerJoin(user, eq(user.id, agentProfiles.ownerId))
      .innerJoin(
        communityMemberships,
        and(
          eq(communityMemberships.userId, agentProfiles.ownerId),
          eq(communityMemberships.communityId, magazine.communityId),
        ),
      )
      .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
      .leftJoin(
        magazineAgentStaff,
        and(
          eq(magazineAgentStaff.magazineId, magazine.id),
          eq(magazineAgentStaff.agentId, agentProfiles.id),
        ),
      )
      .where(
        and(
          eq(agentProfiles.status, "active"),
          eq(communityMemberships.status, "active"),
          isNull(magazineAgentStaff.agentId),
          or(
            ilike(agentProfiles.name, pattern),
            ilike(memberProfiles.displayName, pattern),
            ilike(user.name, pattern),
          ),
        ),
      )
      .orderBy(asc(agentProfiles.name), asc(agentProfiles.id))
      .limit(STAFF_SEARCH_LIMIT),
  ]);
  const candidates: StaffCandidate[] = [
    ...people,
    ...agents.flatMap((agent) =>
      agent.userId
        ? [
            {
              userId: agent.userId,
              name: agent.name,
              image: agent.image,
              agentId: agent.agentId,
              ownerName: agent.ownerName,
            },
          ]
        : [],
    ),
  ];
  candidates.sort(
    (a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
  );
  return candidates.slice(0, STAFF_SEARCH_LIMIT);
}

/** A conditional upsert decides whether the job changed, including racing calls. */
export async function assignMagazineRole(
  database: Deps["db"],
  magazine: StaffMagazine,
  input: { userId: string; role: MagazineRole; agentId?: string },
  actor: { userId: string; community: NoticeCommunity },
): Promise<StaffMember> {
  if (input.agentId) return assignAgentRole(database, magazine, input, actor);
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

async function assignAgentRole(
  database: Deps["db"],
  magazine: StaffMagazine,
  input: { userId: string; role: MagazineRole; agentId?: string },
  actor: { userId: string; community: NoticeCommunity },
): Promise<StaffMember> {
  const agentId = input.agentId;
  if (!agentId) throw magazineError("STAFF_NOT_MEMBER");
  const [agent] = await database
    .select({
      id: agentProfiles.id,
      name: agentProfiles.name,
      image: agentProfiles.avatar,
      ownerId: agentProfiles.ownerId,
      status: agentProfiles.status,
      ownerName: personFields.name,
      membership: membershipFields,
    })
    .from(agentProfiles)
    .innerJoin(user, eq(user.id, agentProfiles.ownerId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .leftJoin(
      communityMemberships,
      and(
        eq(communityMemberships.userId, agentProfiles.ownerId),
        eq(communityMemberships.communityId, magazine.communityId),
      ),
    )
    .where(eq(agentProfiles.id, agentId));
  const communityRole = activeRoleOf(agent?.membership);
  if (
    !agent?.ownerId ||
    agent.ownerId !== input.userId ||
    agent.status !== "active" ||
    communityRole === null
  ) {
    throw magazineError("STAFF_NOT_MEMBER");
  }
  const [changed] = await database
    .insert(magazineAgentStaff)
    .values({
      magazineId: magazine.id,
      communityId: magazine.communityId,
      agentId,
      ownerId: agent.ownerId,
      role: input.role,
      assignedBy: actor.userId,
    })
    .onConflictDoUpdate({
      target: [magazineAgentStaff.magazineId, magazineAgentStaff.agentId],
      set: {
        role: sql`excluded.role`,
        assignedBy: sql`excluded.assigned_by`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${magazineAgentStaff.role} IS DISTINCT FROM excluded.role`,
    })
    .returning();
  const role = changed?.role ?? input.role;
  return {
    userId: agent.ownerId,
    name: agent.name,
    image: agent.image,
    role,
    source: "assigned",
    isActiveMember: true,
    isViewer: false,
    agentId,
    agentOf: agent.ownerName,
  };
}

/** Removing a missing assignment is already a success. */
export async function removeMagazineRole(
  database: Deps["db"],
  magazine: Pick<StaffMagazine, "id">,
  userId: string,
  agentId?: string,
): Promise<void> {
  if (agentId) {
    await database
      .delete(magazineAgentStaff)
      .where(
        and(
          eq(magazineAgentStaff.magazineId, magazine.id),
          eq(magazineAgentStaff.agentId, agentId),
          eq(magazineAgentStaff.ownerId, userId),
        ),
      );
    return;
  }
  await database
    .delete(magazineStaff)
    .where(
      and(
        eq(magazineStaff.magazineId, magazine.id),
        eq(magazineStaff.userId, userId),
      ),
    );
}
