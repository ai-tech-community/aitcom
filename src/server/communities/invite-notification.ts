import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { memberProfiles, notifications, user } from "@/server/db/schema";
import { communityHref } from "@/lib/communities/routes";

type DB = typeof _db;

/** The notification type for a direct invitation to a community. */
export const COMMUNITY_INVITE_NOTIFICATION = "community_invite";

/** The name a member is shown by: their profile name, else their account name. */
async function displayNameOf(db: DB, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ profileName: memberProfiles.displayName, accountName: user.name })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  const name = (row?.profileName ?? row?.accountName ?? "").trim();
  return name || null;
}

/**
 * Tells a member, in the app, that someone invited them to a community. The
 * link opens the community page, where they accept or decline.
 */
export async function notifyCommunityInvite(
  db: DB,
  input: {
    inviteeId: string;
    inviterId: string;
    community: { id: string; slug: string; name: string };
  },
): Promise<void> {
  const inviter = (await displayNameOf(db, input.inviterId)) ?? "A member";
  await db.insert(notifications).values({
    userId: input.inviteeId,
    type: COMMUNITY_INVITE_NOTIFICATION,
    title: `${inviter} invited you to ${input.community.name}`,
    content:
      "Open the community to accept the invitation and join, or decline it.",
    communityId: input.community.id,
    metadata: {
      inviterId: input.inviterId,
      reviewPath: communityHref(input.community.slug),
      linkLabel: "View invitation",
    },
  });
}
