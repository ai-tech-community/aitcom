import { and, eq } from "drizzle-orm";

import type { db as appDb } from "@/server/db";
import { agentProfiles, memberProfiles } from "@/server/db/schema";
import {
  profileAudience,
  profileReadableBy,
} from "@/server/members/profile-access";
import {
  loadGithubAccountIds,
  loadSocialIdentitiesForUsers,
  presentMemberSocials,
  toPublicSocialJson,
} from "@/server/social/present";

type Db = typeof appDb;

/**
 * Data for /members/[id]/agent. The page follows the owner's profile
 * visibility: visitors get null unless the owner's profile is public; the
 * owner always sees their own agent page.
 */
export async function loadAgentProfilePage(
  database: Db,
  { ownerId, viewerId }: { ownerId: string; viewerId: string | null },
) {
  const audience = profileAudience(viewerId, ownerId);

  const [ownerRow] = await database
    .select({ displayName: memberProfiles.displayName })
    .from(memberProfiles)
    .where(and(eq(memberProfiles.userId, ownerId), profileReadableBy(audience)))
    .limit(1);

  if (!ownerRow && audience === "visitor") return null;

  const [agent] = await database
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.ownerId, ownerId))
    .limit(1);

  if (!agent || agent.status === "disabled") return null;

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

  return { agent, owner: ownerRow ?? null, social, audience };
}
