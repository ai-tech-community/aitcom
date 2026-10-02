import { and, eq } from "drizzle-orm";

import { hasAgentOnPublicRoster } from "@/lib/public-roster";
import type { db as appDb } from "@/server/db";
import { agentProfiles, memberProfiles } from "@/server/db/schema";
import {
  profileAudience,
  profileReach,
  profileReachColumns,
  profileReadableBy,
  type ProfileAudience,
  type ProfileReach,
} from "@/server/members/profile-access";
import {
  loadGithubAccountIds,
  loadSocialIdentitiesForUsers,
  presentMemberSocials,
  toPublicSocialJson,
} from "@/server/social/present";

type Db = typeof appDb;

/** The agent fields /members/[id]/agent renders. */
export interface PublicAgentProfile {
  name: string;
  avatar: string | null;
  bio: string | null;
  description: string | null;
  expertiseTags: string[];
  totalContributions: number;
  createdAt: Date;
}

/**
 * Whether visitors can see the agent page, and if not, why (owner only).
 * Profile reasons come from `ProfileReach`; `agentNotActive` carries the
 * agent's status so the owner sees which state it is in.
 */
export type AgentPageReach =
  | ProfileReach
  | { kind: "ownerOnly"; reason: "agentNotActive"; agentStatus: string };

export interface AgentProfilePage {
  agent: PublicAgentProfile;
  owner: { displayName: string } | null;
  social: ReturnType<typeof toPublicSocialJson>;
  audience: ProfileAudience;
  reach: AgentPageReach;
}

/**
 * The visitor rule for an agent page: the owner's profile is public, the
 * agent is active, and the roster lists the owner as having an agent.
 */
export function agentPageReach(input: {
  ownerId: string;
  profile: { isPublic: boolean; hiddenByStaff: boolean } | null;
  agent: { id: string; status: string };
}): AgentPageReach {
  if (!input.profile) return { kind: "ownerOnly", reason: "private" };
  const reach = profileReach(input.profile);
  if (reach.kind !== "public") return reach;
  if (input.agent.status !== "active") {
    return {
      kind: "ownerOnly",
      reason: "agentNotActive",
      agentStatus: input.agent.status,
    };
  }
  if (
    !hasAgentOnPublicRoster({
      userId: input.ownerId,
      ownedActiveAgentId: input.agent.id,
    })
  ) {
    return { kind: "ownerOnly", reason: "hiddenByStaff" };
  }
  return { kind: "public" };
}

/**
 * Data for /members/[id]/agent. Visitors get null unless `agentPageReach`
 * is public; the owner always sees their own agent page, in any status.
 */
export async function loadAgentProfilePage(
  database: Db,
  { ownerId, viewerId }: { ownerId: string; viewerId: string | null },
): Promise<AgentProfilePage | null> {
  const audience = profileAudience(viewerId, ownerId);

  const [ownerRow] = await database
    .select({
      displayName: memberProfiles.displayName,
      ...profileReachColumns(),
    })
    .from(memberProfiles)
    .where(and(eq(memberProfiles.userId, ownerId), profileReadableBy(audience)))
    .limit(1);

  if (!ownerRow && audience === "visitor") return null;

  const [agent] = await database
    .select({
      id: agentProfiles.id,
      name: agentProfiles.name,
      avatar: agentProfiles.avatar,
      bio: agentProfiles.bio,
      description: agentProfiles.description,
      expertiseTags: agentProfiles.expertiseTags,
      totalContributions: agentProfiles.totalContributions,
      createdAt: agentProfiles.createdAt,
      status: agentProfiles.status,
    })
    .from(agentProfiles)
    .where(eq(agentProfiles.ownerId, ownerId))
    .limit(1);

  if (!agent) return null;

  const reach = agentPageReach({
    ownerId,
    profile: ownerRow ?? null,
    agent,
  });
  if (audience === "visitor" && reach.kind !== "public") return null;

  const [identitiesByUser, githubAccountIds] = await Promise.all([
    loadSocialIdentitiesForUsers(database, [ownerId]),
    loadGithubAccountIds(database, [ownerId]),
  ]);

  const social = toPublicSocialJson(
    presentMemberSocials({
      userId: ownerId,
      identities: identitiesByUser.get(ownerId) ?? [],
      hasGithubAccount: githubAccountIds.has(ownerId),
      pasted: {},
      subject: "agent",
    }),
  );

  return {
    agent: {
      name: agent.name,
      avatar: agent.avatar ?? null,
      bio: agent.bio ?? null,
      description: agent.description ?? null,
      expertiseTags: agent.expertiseTags ?? [],
      totalContributions: agent.totalContributions,
      createdAt: agent.createdAt,
    },
    owner: ownerRow ? { displayName: ownerRow.displayName } : null,
    social,
    audience,
    reach,
  };
}
