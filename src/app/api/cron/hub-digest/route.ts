import { NextResponse } from "next/server";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  communityMemberships,
  communities,
  activityEvents,
  digestSendLog,
  notificationOptouts,
  user,
  communityEngageConfig,
  rituals,
  ritualOccurrences,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import {
  buildHubDigest,
  summarizeCommunitySection,
} from "@/server/notifications/digest";
import {
  buildRitualItems,
  type EngageConfig,
  type RitualRecapItem,
  type RitualReminderItem,
} from "@/server/notifications/ritual-items";
import { weekdayLabel } from "@/server/communities/rituals";
import {
  CONTRIBUTION_ACTIONS,
  selectAtRisk,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";
import { resolvePrefs, type OptoutRow } from "@/server/notifications/prefs";
import { currentPeriodKey } from "@/server/notifications/constants";
import { renderHubDigestHtml } from "@/server/notifications/render";
import { sendHubDigestEmail } from "@/server/email";

// At-risk selection params — mirror advisory.atRiskMembers exactly.
const WINDOW_DAYS = 14;
const PRIOR_WINDOW_DAYS = 45;
const AT_RISK_CAP = 50;
const CONTRIBUTION_ACTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

const ENGAGE_DEFAULTS: EngageConfig = {
  ritualRecap: true,
  ritualReminder: true,
  atRiskLine: false,
};

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
      name: user.name,
    })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communityMemberships.communityId, communities.id),
    )
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .where(eq(communityMemberships.status, "active"));

  const byUser = new Map<
    string,
    { email: string; name: string | null; rows: typeof memberships }
  >();
  for (const m of memberships) {
    const entry = byUser.get(m.userId) ?? {
      email: m.email,
      name: m.name,
      rows: [],
    };
    entry.rows.push(m);
    byUser.set(m.userId, entry);
  }

  // ---- Per-community engage data (computed ONCE, before the user loop) ----

  // Engage config per community (default when no row exists).
  const cfgRows = await db.select().from(communityEngageConfig);
  const cfgByCommunity = new Map(cfgRows.map((c) => [c.communityId, c]));
  const cfgOf = (communityId: string): EngageConfig =>
    cfgByCommunity.get(communityId) ?? ENGAGE_DEFAULTS;

  // Recap: this week's posted ritual occurrences + their thread reply counts.
  const recapRows = await db
    .select({
      communityId: ritualOccurrences.communityId,
      title: rituals.title,
      threadId: ritualOccurrences.threadId,
    })
    .from(ritualOccurrences)
    .innerJoin(rituals, eq(rituals.id, ritualOccurrences.ritualId))
    .where(
      and(
        eq(ritualOccurrences.status, "posted"),
        gte(ritualOccurrences.postedAt, weekAgo),
      ),
    );

  const recapThreadIds = [
    ...new Set(
      recapRows
        .map((r) => r.threadId)
        .filter((id): id is number => id !== null),
    ),
  ];
  const replyCountByThread = new Map<number, number>();
  if (recapThreadIds.length > 0) {
    // forum-threads is a Payload-owned (public schema) collection; read it via
    // the Payload client to avoid the dual-drizzle-version type clash with `db`.
    const payload = await getPayloadClient();
    const threads = await payload.find({
      collection: "forum-threads",
      where: { id: { in: recapThreadIds } },
      limit: recapThreadIds.length,
      depth: 0,
    });
    for (const t of threads.docs) {
      replyCountByThread.set(Number(t.id), t.replyCount ?? 0);
    }
  }

  const recapByCommunity = new Map<string, RitualRecapItem[]>();
  for (const r of recapRows) {
    if (r.threadId === null) continue; // no thread → no reply count to recap
    const list = recapByCommunity.get(r.communityId) ?? [];
    list.push({
      title: r.title,
      replyCount: replyCountByThread.get(r.threadId) ?? 0,
    });
    recapByCommunity.set(r.communityId, list);
  }

  // Reminders: upcoming active rituals, grouped by community.
  const activeRituals = await db
    .select()
    .from(rituals)
    .where(eq(rituals.status, "active"));
  const remindersByCommunity = new Map<string, RitualReminderItem[]>();
  for (const r of activeRituals) {
    const list = remindersByCommunity.get(r.communityId) ?? [];
    list.push({ title: r.title, weekdayLabel: weekdayLabel(r.weekday) });
    remindersByCommunity.set(r.communityId, list);
  }

  // At-risk sets: only for communities with the atRiskLine toggle ON.
  // Mirrors advisory.atRiskMembers' query shape, scoped per community.
  const atRiskByCommunity = new Map<string, Set<string>>();
  const atRiskCommunityIds = cfgRows
    .filter((c) => c.atRiskLine)
    .map((c) => c.communityId);
  const atRiskSince = windowStart(now, PRIOR_WINDOW_DAYS);
  for (const communityId of atRiskCommunityIds) {
    const [atRiskMemberships, atRiskEvents] = await Promise.all([
      db
        .select({
          userId: communityMemberships.userId,
          role: communityMemberships.role,
          status: communityMemberships.status,
          joinedAt: communityMemberships.joinedAt,
        })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.status, "active"),
          ),
        ),
      db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, communityId),
            gte(activityEvents.createdAt, atRiskSince),
            inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
          ),
        ),
    ]);
    const atRisk = selectAtRisk({
      memberships: atRiskMemberships as MembershipRow[],
      contributions: atRiskEvents as ActivityRow[],
      now,
      windowDays: WINDOW_DAYS,
      priorWindowDays: PRIOR_WINDOW_DAYS,
      cap: AT_RISK_CAP,
    });
    atRiskByCommunity.set(communityId, new Set(atRisk.map((m) => m.userId)));
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

  for (const [userId, { email, name, rows }] of byUser) {
    const prefs = resolvePrefs(optoutByUser.get(userId) ?? []);
    if (prefs.globalDigestOptOut) continue;

    const recipientName = name ?? "there";

    const sections = rows.map((r) =>
      summarizeCommunitySection({
        communityId: r.communityId,
        communityName: r.communityName,
        newThreads: countOf(r.communityId, "thread.create"),
        newEvents: countOf(r.communityId, "event.create"),
        newMembers: countOf(r.communityId, "community.joined"),
        ritualItems: buildRitualItems({
          config: cfgOf(r.communityId),
          recap: recapByCommunity.get(r.communityId) ?? [],
          reminders: remindersByCommunity.get(r.communityId) ?? [],
          recipientIsAtRisk:
            atRiskByCommunity.get(r.communityId)?.has(userId) ?? false,
          recipientName,
        }),
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
