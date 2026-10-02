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

/** Who may see a member's agent page, read with as little as possible. */
export interface AgentPageAccess {
  audience: ProfileAudience;
  reach: AgentPageReach;
  agentId: string;
  /** Null when the owner has no profile (only the owner gets this far). */
  ownerDisplayName: string | null;
}

/**
 * Whether this viewer may see the member's agent page: visitors only when
 * `agentPageReach` is public; the owner always, in any agent status. Null
 * when they may not, or there is no agent. Selects only what the rule needs,
 * so the profile frame can decide the Agent tab without loading the page.
 */
export async function loadAgentPageAccess(
  database: Db,
  { ownerId, viewerId }: { ownerId: string; viewerId: string | null },
): Promise<AgentPageAccess | null> {
  const audience = profileAudience(viewerId, ownerId);

  const [[ownerRow], [agent]] = await Promise.all([
    database
      .select({
        displayName: memberProfiles.displayName,
        ...profileReachColumns(),
      })
      .from(memberProfiles)
      .where(
        and(eq(memberProfiles.userId, ownerId), profileReadableBy(audience)),
      )
      .limit(1),
    database
      .select({ id: agentProfiles.id, status: agentProfiles.status })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, ownerId))
      .limit(1),
  ]);

  if (!agent) return null;
  if (!ownerRow && audience === "visitor") return null;

  const reach = agentPageReach({
    ownerId,
    profile: ownerRow ?? null,
    agent,
  });
  if (audience === "visitor" && reach.kind !== "public") return null;

  return {
    audience,
    reach,
    agentId: agent.id,
    ownerDisplayName: ownerRow?.displayName ?? null,
  };
}

/**
 * Data for /members/[id]/agent: the access check, then the page's fields.
 */
export async function loadAgentProfilePage(
  database: Db,
  { ownerId, viewerId }: { ownerId: string; viewerId: string | null },
): Promise<AgentProfilePage | null> {
  const access = await loadAgentPageAccess(database, { ownerId, viewerId });
  if (!access) return null;

  const [agent] = await database
    .select({
      name: agentProfiles.name,
      avatar: agentProfiles.avatar,
      bio: agentProfiles.bio,
      description: agentProfiles.description,
      expertiseTags: agentProfiles.expertiseTags,
      totalContributions: agentProfiles.totalContributions,
      createdAt: agentProfiles.createdAt,
    })
    .from(agentProfiles)
    .where(eq(agentProfiles.id, access.agentId))
    .limit(1);
  if (!agent) return null;

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
    owner:
      access.ownerDisplayName !== null
        ? { displayName: access.ownerDisplayName }
        : null,
    social,
    audience: access.audience,
    reach: access.reach,
  };
}
