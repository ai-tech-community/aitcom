import { NextResponse } from "next/server";
import { eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  communityMemberships,
  communities,
  activityEvents,
  digestSendLog,
  notificationOptouts,
  user,
} from "@/server/db/schema";
import {
  buildHubDigest,
  summarizeCommunitySection,
} from "@/server/notifications/digest";
import { resolvePrefs, type OptoutRow } from "@/server/notifications/prefs";
import { currentPeriodKey } from "@/server/notifications/constants";
import { renderHubDigestHtml } from "@/server/notifications/render";
import { sendHubDigestEmail } from "@/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const periodKey = currentPeriodKey(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let sent = 0;

  // Per-community window counts, grouped by (community_id, action).
  const counts = await db
    .select({
      communityId: activityEvents.communityId,
      action: activityEvents.action,
      n: sql<number>`count(*)::int`,
    })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, weekAgo))
    .groupBy(activityEvents.communityId, activityEvents.action);

  const countMap = new Map(
    counts.map((c) => [`${c.communityId}:${c.action}`, c.n]),
  );
  const countOf = (communityId: string, action: string) =>
    countMap.get(`${communityId}:${action}`) ?? 0;

  // All active members with their communities.
  const memberships = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      communityName: communities.name,
      email: user.email,
    })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communityMemberships.communityId, communities.id),
    )
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .where(eq(communityMemberships.status, "active"));

  const byUser = new Map<string, { email: string; rows: typeof memberships }>();
  for (const m of memberships) {
    const entry = byUser.get(m.userId) ?? { email: m.email, rows: [] };
    entry.rows.push(m);
    byUser.set(m.userId, entry);
  }

  // Batch opt-out read: one query for all users instead of one per user.
  const allUserIds = [...byUser.keys()];
  const allOptouts =
    allUserIds.length === 0
      ? []
      : await db
          .select({
            userId: notificationOptouts.userId,
            communityId: notificationOptouts.communityId,
            category: notificationOptouts.category,
          })
          .from(notificationOptouts)
          .where(inArray(notificationOptouts.userId, allUserIds));
  const optoutByUser = new Map<string, OptoutRow[]>();
  for (const row of allOptouts) {
    const list = optoutByUser.get(row.userId) ?? [];
    list.push(row);
    optoutByUser.set(row.userId, list);
  }

  for (const [userId, { email, rows }] of byUser) {
    const prefs = resolvePrefs(optoutByUser.get(userId) ?? []);
    if (prefs.globalDigestOptOut) continue;

    const sections = rows.map((r) =>
      summarizeCommunitySection({
        communityId: r.communityId,
        communityName: r.communityName,
        newThreads: countOf(r.communityId, "thread.create"),
        newEvents: countOf(r.communityId, "event.create"),
        newMembers: countOf(r.communityId, "community.joined"),
        ritualItems: [], // Slice C fills this
      }),
    );

    const digest = buildHubDigest({
      userId,
      sections,
      optedOutCommunityIds: prefs.digestOptOutCommunityIds,
    });
    if (!digest) continue;

    // Claim-before-send: insert idempotency row first; only send if claim won.
    // At-most-once semantics: if send fails after claiming, member skips this
    // week (acceptable for weekly digest; prevents double-send / concurrent-run crash).
    const claimed = await db
      .insert(digestSendLog)
      .values({ userId, periodKey })
      .onConflictDoNothing()
      .returning({ id: digestSendLog.id });
    if (claimed.length === 0) continue; // already sent this period

    let ok = false;
    try {
      ok = await sendHubDigestEmail(email, renderHubDigestHtml(digest));
    } catch (err) {
      console.error(`hub-digest: send failed for ${userId}`, err);
    }
    if (ok) sent++;
  }

  return NextResponse.json({ success: true, sent, periodKey });
}
