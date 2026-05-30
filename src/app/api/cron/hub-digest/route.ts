import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";

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

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
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

  const countOf = (communityId: string, action: string) =>
    counts.find((c) => c.communityId === communityId && c.action === action)?.n ?? 0;

  // All active members with their communities.
  const memberships = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      communityName: communities.name,
      email: user.email,
    })
    .from(communityMemberships)
    .innerJoin(communities, eq(communityMemberships.communityId, communities.id))
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .where(eq(communityMemberships.status, "active"));

  const byUser = new Map<
    string,
    { email: string; rows: typeof memberships }
  >();
  for (const m of memberships) {
    const entry = byUser.get(m.userId) ?? { email: m.email, rows: [] };
    entry.rows.push(m);
    byUser.set(m.userId, entry);
  }

  for (const [userId, { email, rows }] of byUser) {
    // Idempotency: skip if already sent this period.
    const already = await db
      .select({ id: digestSendLog.id })
      .from(digestSendLog)
      .where(
        and(
          eq(digestSendLog.userId, userId),
          eq(digestSendLog.periodKey, periodKey),
        ),
      )
      .limit(1);
    if (already.length > 0) continue;

    const optoutRows = await db
      .select({
        communityId: notificationOptouts.communityId,
        category: notificationOptouts.category,
      })
      .from(notificationOptouts)
      .where(eq(notificationOptouts.userId, userId));
    const prefs = resolvePrefs(optoutRows as OptoutRow[]);
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

    const ok = await sendHubDigestEmail(email, renderHubDigestHtml(digest));
    if (ok) {
      await db.insert(digestSendLog).values({ userId, periodKey });
      sent++;
    }
  }

  return NextResponse.json({ success: true, sent, periodKey });
}
