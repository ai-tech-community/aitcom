import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  activityEvents,
  communities,
  communityEngageConfig,
  communityMemberships,
  notificationOptouts,
  ritualOccurrences,
  rituals,
  user,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { loadDiscoveryCandidates } from "@/server/communities/discovery-queries";
import { rankCommunitiesForMember } from "@/server/communities/discovery";
import {
  AT_RISK_CAP,
  AT_RISK_PRIOR_WINDOW_DAYS,
  AT_RISK_WINDOW_DAYS,
  selectAtRisk,
} from "@/server/communities/insights";
import { loadAtRiskInputs } from "@/server/communities/insights-queries";
import { weekdayLabel } from "@/server/communities/rituals";
import {
  buildHubDigest,
  summarizeCommunitySection,
  type HubDigest,
} from "@/server/notifications/digest";
import { resolvePrefs, type OptoutRow } from "@/server/notifications/prefs";
import {
  buildRitualItems,
  type EngageConfig,
  type RitualRecapItem,
  type RitualReminderItem,
} from "@/server/notifications/ritual-items";

const ENGAGE_DEFAULTS: EngageConfig = {
  ritualRecap: true,
  ritualReminder: true,
  atRiskLine: false,
};

export type LoadedMemberDigest = {
  userId: string;
  email: string;
  globalDigestOptOut: boolean;
  /** Null when the week has nothing to say. Does not write digest_send_log. */
  digest: HubDigest | null;
};

/**
 * Assemble digest content for active members. Pass `onlyUserId` to preview
 * one member. This does not send mail and does not claim a send.
 */
export async function loadHubDigests(
  now: Date,
  onlyUserId?: string,
): Promise<LoadedMemberDigest[]> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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
    .where(
      onlyUserId
        ? and(
            eq(communityMemberships.status, "active"),
            eq(communityMemberships.userId, onlyUserId),
          )
        : eq(communityMemberships.status, "active"),
    );

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

  const cfgRows = await db.select().from(communityEngageConfig);
  const cfgByCommunity = new Map(cfgRows.map((c) => [c.communityId, c]));
  const cfgOf = (communityId: string): EngageConfig =>
    cfgByCommunity.get(communityId) ?? ENGAGE_DEFAULTS;

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
    const payload = await getPayloadClient();
    const threads = await payload.find({
      collection: "forum-threads",
      where: { id: { in: recapThreadIds } },
      limit: recapThreadIds.length,
      depth: 0,
    });
    for (const thread of threads.docs) {
      replyCountByThread.set(Number(thread.id), thread.replyCount ?? 0);
    }
  }

  const recapByCommunity = new Map<string, RitualRecapItem[]>();
  for (const row of recapRows) {
    if (row.threadId === null) continue;
    const list = recapByCommunity.get(row.communityId) ?? [];
    list.push({
      title: row.title,
      replyCount: replyCountByThread.get(row.threadId) ?? 0,
    });
    recapByCommunity.set(row.communityId, list);
  }

  const activeRituals = await db
    .select()
    .from(rituals)
    .where(eq(rituals.status, "active"));
  const remindersByCommunity = new Map<string, RitualReminderItem[]>();
  for (const ritual of activeRituals) {
    const list = remindersByCommunity.get(ritual.communityId) ?? [];
    list.push({
      title: ritual.title,
      weekdayLabel: weekdayLabel(ritual.weekday),
    });
    remindersByCommunity.set(ritual.communityId, list);
  }

  const atRiskByCommunity = new Map<string, Set<string>>();
  const atRiskCommunityIds = cfgRows
    .filter((c) => c.atRiskLine)
    .map((c) => c.communityId);
  for (const communityId of atRiskCommunityIds) {
    const { memberships: atRiskMemberships, contributions: atRiskEvents } =
      await loadAtRiskInputs(db, communityId, now);
    const atRisk = selectAtRisk({
      memberships: atRiskMemberships,
      contributions: atRiskEvents,
      now,
      windowDays: AT_RISK_WINDOW_DAYS,
      priorWindowDays: AT_RISK_PRIOR_WINDOW_DAYS,
      cap: AT_RISK_CAP,
    });
    atRiskByCommunity.set(communityId, new Set(atRisk.map((m) => m.userId)));
  }

  const discoveryCandidates = await loadDiscoveryCandidates(db, now, {
    crossPromoteOnly: true,
  });

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

  const loaded: LoadedMemberDigest[] = [];
  for (const [userId, { email, name, rows }] of byUser) {
    const prefs = resolvePrefs(optoutByUser.get(userId) ?? []);
    const memberIds = new Set(rows.map((r) => r.communityId));
    const topPick = rankCommunitiesForMember({
      candidates: discoveryCandidates,
      memberCommunityIds: memberIds,
      limit: 1,
    })[0];
    const discovery = topPick
      ? { name: topPick.name, slug: topPick.slug }
      : null;
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
    loaded.push({
      userId,
      email,
      globalDigestOptOut: prefs.globalDigestOptOut,
      digest: buildHubDigest({
        userId,
        sections,
        optedOutCommunityIds: prefs.digestOptOutCommunityIds,
        discovery,
      }),
    });
  }
  return loaded;
}
