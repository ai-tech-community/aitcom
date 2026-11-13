import { eq } from "drizzle-orm";

import type { db } from "@/server/db";
import { communities, notifications } from "@/server/db/schema";
import { communityModeratorIds } from "@/server/moderation/report-rules";

import type { GalleryReportNotifier } from "./reports";

/**
 * The notices gallery reports send (spec 2026-11-13, Reports and
 * moderation). Stored in English, like the feed's report notice: no
 * notification text is translated per reader. Each one links to the item
 * open in the gallery (`metadata.reviewPath`), which the bell panel turns
 * into its button.
 */

type Database = typeof db;

export const GALLERY_ITEM_REPORTED_NOTIFICATION = "gallery_item_reported";
export const GALLERY_ITEM_THIS_IS_ME_NOTIFICATION = "gallery_item_this_is_me";

/** The item open in its community's gallery. */
export function galleryItemPath(slug: string, itemId: number): string {
  return `/communities/${slug}/gallery?item=${itemId}`;
}

type Notice = {
  type: string;
  title: string;
  content: string;
  linkLabel: string;
};

/** The community's name and slug, or null once it is gone. */
async function noticeCommunity(database: Database, communityId: string) {
  const community = await database.query.communities.findFirst({
    where: eq(communities.id, communityId),
    columns: { slug: true, name: true },
  });
  return community ?? null;
}

/** One insert for every recipient; nothing when there is no one to tell. */
async function insertNotices(
  database: Database,
  input: {
    userIds: readonly string[];
    communityId: string;
    itemId: number;
    slug: string;
    notice: Notice;
  },
): Promise<void> {
  if (input.userIds.length === 0) return;
  const { linkLabel, ...text } = input.notice;
  await database.insert(notifications).values(
    input.userIds.map((userId) => ({
      userId,
      ...text,
      communityId: input.communityId,
      metadata: {
        itemId: input.itemId,
        reviewPath: galleryItemPath(input.slug, input.itemId),
        linkLabel,
      },
    })),
  );
}

/**
 * Tells the community's moderators that a report hid an item. Sent once
 * per hide: the report service calls it only for the report that hid it.
 */
export async function notifyGalleryItemReported(
  database: Database,
  input: { communityId: string; itemId: number },
): Promise<void> {
  const community = await noticeCommunity(database, input.communityId);
  if (!community) return;
  await insertNotices(database, {
    userIds: await communityModeratorIds(database, input.communityId),
    communityId: input.communityId,
    itemId: input.itemId,
    slug: community.slug,
    notice: {
      type: GALLERY_ITEM_REPORTED_NOTIFICATION,
      title: "A photo or video was reported",
      content: `A photo or video in **${community.name}** was reported and is hidden until you review it.`,
      linkLabel: "Review it",
    },
  });
}

/**
 * Tells the uploader that someone said they are in their photo or video
 * and asked to be removed. The report service skips deleted accounts.
 */
export async function notifyUploaderThisIsMe(
  database: Database,
  input: { communityId: string; itemId: number; uploaderId: string },
): Promise<void> {
  const community = await noticeCommunity(database, input.communityId);
  if (!community) return;
  await insertNotices(database, {
    userIds: [input.uploaderId],
    communityId: input.communityId,
    itemId: input.itemId,
    slug: community.slug,
    notice: {
      type: GALLERY_ITEM_THIS_IS_ME_NOTIFICATION,
      title: "Someone asked to be removed from your photo or video",
      content: `Someone says they are in a photo or video you added to **${community.name}** and asked to be removed. It is hidden while moderators review it. You can also delete it yourself.`,
      linkLabel: "See it",
    },
  });
}

/** The report service's notices, sent through this database. */
export function galleryReportNotices(
  database: Database,
): GalleryReportNotifier {
  return {
    itemReported: (input) => notifyGalleryItemReported(database, input),
    uploaderThisIsMe: (input) => notifyUploaderThisIsMe(database, input),
  };
}
