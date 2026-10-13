import { and, eq, sql } from "drizzle-orm";

import { forumThreadCommunitiesWhere } from "@/server/communities/forum-scope";
import { db } from "@/server/db";
import { startupRoles, startups } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

import type {
  DigestEventItem,
  DigestJobItem,
  DigestStartupItem,
} from "./digest";
import {
  eventItem,
  feedHighlight,
  forumHighlight,
  startupItem,
  jobItem,
  textOf,
  type CommunityRef,
} from "./digest-items";
import {
  DIGEST_JOB_DESCRIPTION_MIN,
  selectDigestJobs,
  selectLaunchpadPicks,
  selectUpcomingEvents,
  type HighlightCandidate,
  type LaunchpadCandidate,
  type UpcomingEventCandidate,
} from "./digest-sections";

async function readOrEmpty<T>(
  label: string,
  load: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await load();
  } catch (err) {
    console.error(`hub-digest: ${label} unavailable`, err);
    return [];
  }
}

export async function loadHighlightPool(
  communities: readonly CommunityRef[],
  weekAgo: Date,
): Promise<HighlightCandidate[]> {
  if (communities.length === 0) return [];
  return readOrEmpty("highlights", async () => {
    const payload = await getPayloadClient();
    const ids = communities.map((community) => community.id);
    const since = weekAgo.toISOString();
    const [threads, posts] = await Promise.all([
      payload.find({
        collection: "forum-threads",
        where: {
          and: [
            { isDeleted: { not_equals: true } },
            forumThreadCommunitiesWhere(communities),
            { lastActivityAt: { greater_than_equal: since } },
          ],
        },
        sort: "-replyCount",
        limit: 100,
        depth: 0,
      }),
      payload.find({
        collection: "feed-posts",
        where: {
          and: [
            { isDeleted: { not_equals: true } },
            { hiddenAt: { exists: false } },
            { communityId: { in: ids } },
            { createdAt: { greater_than_equal: since } },
          ],
        },
        sort: "-likeCount",
        limit: 100,
        depth: 0,
      }),
    ]);
    return [
      ...threads.docs.flatMap((doc) => {
        const item = forumHighlight(doc, communities);
        return item ? [item] : [];
      }),
      ...posts.docs.flatMap((doc) => {
        const item = feedHighlight(doc, communities);
        return item ? [item] : [];
      }),
    ];
  });
}

export async function loadDigestEvents(now: Date): Promise<DigestEventItem[]> {
  return readOrEmpty("events", async () => {
    const payload = await getPayloadClient();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const horizon = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    const found = await payload.find({
      collection: "events",
      where: {
        and: [
          { status: { equals: "published" } },
          { discoverySource: { not_equals: "luma" } },
          { date: { greater_than_equal: start.toISOString() } },
          { date: { less_than: horizon.toISOString() } },
        ],
      },
      sort: "date",
      limit: 20,
      depth: 0,
    });
    const candidates: UpcomingEventCandidate[] = found.docs.flatMap((doc) => {
      const title = textOf(doc.title);
      const slug = textOf(doc.slug);
      const date = textOf(doc.date);
      if (!title || !slug || !date) return [];
      return [
        {
          title,
          slug,
          date,
          endDate: textOf(doc.endDate) ? textOf(doc.endDate) : null,
          status: textOf(doc.status) ? textOf(doc.status) : "published",
        },
      ];
    });
    return selectUpcomingEvents(candidates, now).flatMap((event) => {
      const item = eventItem(event);
      return item ? [item] : [];
    });
  });
}

export async function loadDigestJobs(): Promise<DigestJobItem[]> {
  return readOrEmpty("jobs", async () => {
    const rows = await db
      .select({
        title: startupRoles.title,
        slug: startupRoles.slug,
        company: startups.name,
        status: startupRoles.status,
        descriptionText: startupRoles.descriptionText,
        postedAt: startupRoles.postedAt,
        createdAt: startupRoles.createdAt,
      })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(
        and(
          eq(startupRoles.status, "open"),
          eq(startups.status, "approved"),
          sql`char_length(${startupRoles.descriptionText}) >= ${DIGEST_JOB_DESCRIPTION_MIN}`,
        ),
      )
      .orderBy(
        sql`coalesce(${startupRoles.postedAt}, ${startupRoles.createdAt}) desc`,
      )
      .limit(80);
    return selectDigestJobs(rows).flatMap((job) => {
      const item = jobItem(job);
      return item ? [item] : [];
    });
  });
}

export async function loadDigestStartups(
  now: Date,
): Promise<DigestStartupItem[]> {
  return readOrEmpty("startups", async () => {
    const payload = await getPayloadClient();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const found = await payload.find({
      collection: "launchpad-projects",
      where: {
        and: [
          { status: { equals: "published" } },
          { createdAt: { greater_than_equal: weekAgo.toISOString() } },
        ],
      },
      sort: "-voteCount",
      limit: 20,
      depth: 0,
    });
    const candidates: LaunchpadCandidate[] = found.docs.flatMap((doc) => {
      const title = textOf(doc.title);
      const slug = textOf(doc.slug);
      const createdAt = textOf(doc.createdAt);
      if (!title || !slug || !createdAt) return [];
      return [
        {
          title,
          slug,
          status: "published",
          voteCount: typeof doc.voteCount === "number" ? doc.voteCount : 0,
          createdAt,
        },
      ];
    });
    return selectLaunchpadPicks(candidates, now).flatMap((project) => {
      const item = startupItem(project);
      return item ? [item] : [];
    });
  });
}
