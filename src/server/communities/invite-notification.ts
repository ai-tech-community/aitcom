import { and, eq, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { memberProfiles, notifications, user } from "@/server/db/schema";
import { communityHref } from "@/lib/communities/routes";
import { clipText, oneLine } from "@/lib/text-utils";
import type { Tx } from "./activate-membership";

type DB = typeof _db | Tx;

/** The notification type for a direct invitation to a community. */
export const COMMUNITY_INVITE_NOTIFICATION = "community_invite";

/** `notification.title` is varchar(255). */
const TITLE_MAX = 255;
/** Names are member-chosen and up to 255 characters; keep the sentence readable. */
const INVITER_NAME_MAX = 60;
const COMMUNITY_NAME_MAX = 120;

/** The name a member is shown by: their profile name, else their account name. */
async function displayNameOf(db: DB, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ profileName: memberProfiles.displayName, accountName: user.name })
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  const name = oneLine(row?.profileName ?? row?.accountName ?? "");
  return name || null;
}

/** "{inviter} invited you to {community}", always within the title column. */
export function communityInviteTitle(
  inviterName: string | null,
  communityName: string,
): string {
  const inviter = clipText(
    oneLine(inviterName ?? "") || "A member",
    INVITER_NAME_MAX,
  );
  const community = clipText(oneLine(communityName), COMMUNITY_NAME_MAX);
  return clipText(`${inviter} invited you to ${community}`, TITLE_MAX);
}

/**
 * Tells a member, in the app, that someone invited them to a community. The
 * link opens the community page, where they accept or decline. Pass the
 * transaction that writes the invitation, so both land or neither does.
 */
export async function notifyCommunityInvite(
  db: DB,
  input: {
    inviteeId: string;
    inviterId: string;
    community: { id: string; slug: string; name: string };
  },
): Promise<void> {
  const inviter = await displayNameOf(db, input.inviterId);
  await db.insert(notifications).values({
    userId: input.inviteeId,
    type: COMMUNITY_INVITE_NOTIFICATION,
    title: communityInviteTitle(inviter, input.community.name),
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

/**
 * Once an invitation is answered, its open notices are marked read and
 * lose their link (the invitation they pointed at is gone), recording how
 * it was answered.
 */
export async function resolveCommunityInviteNotices(
  db: DB,
  input: {
    userId: string;
    communityId: string;
    resolution: "accepted" | "declined";
  },
): Promise<void> {
  await db
    .update(notifications)
    .set({
      readAt: sql`coalesce(${notifications.readAt}, now())`,
      metadata: sql`((${notifications.metadata}::jsonb - 'reviewPath' - 'linkLabel') || jsonb_build_object('resolution', ${input.resolution}::text))::json`,
    })
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.communityId, input.communityId),
        eq(notifications.type, COMMUNITY_INVITE_NOTIFICATION),
        sql`${notifications.metadata}::jsonb ->> 'resolution' IS NULL`,
      ),
    );
}
