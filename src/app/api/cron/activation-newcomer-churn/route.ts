import { NextResponse } from "next/server";
import { and, eq, gte, lte, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  communityMemberships,
  activityEvents,
  notifications,
  communities,
} from "@/server/db/schema";
import {
  CONTRIBUTION_ACTIONS,
  windowStart,
} from "@/server/communities/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHURN_MIN_DAYS = 23;
const CHURN_MAX_DAYS = 30;
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const youngCutoff = windowStart(now, CHURN_MIN_DAYS); // joined on/before this = old enough
  const oldCutoff = windowStart(now, CHURN_MAX_DAYS); // joined on/after this = recent enough

  const cohort = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
    })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.status, "active"),
        lte(communityMemberships.joinedAt, youngCutoff),
        gte(communityMemberships.joinedAt, oldCutoff),
      ),
    );
  if (cohort.length === 0)
    return NextResponse.json({ success: true, notified: 0 });

  const cohortIds = [...new Set(cohort.map((c) => c.userId))];
  const contributors = await db
    .selectDistinct({
      actorId: activityEvents.actorId,
      communityId: activityEvents.communityId,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.actorId, cohortIds),
        inArray(activityEvents.action, CONTRIBUTION_LIST),
      ),
    );
  const contributedKey = new Set(
    contributors.map((c) => `${c.communityId}:${c.actorId}`),
  );

  const byCommunity = new Map<string, number>();
  for (const m of cohort) {
    if (contributedKey.has(`${m.communityId}:${m.userId}`)) continue;
    byCommunity.set(m.communityId, (byCommunity.get(m.communityId) ?? 0) + 1);
  }
  if (byCommunity.size === 0)
    return NextResponse.json({ success: true, notified: 0 });

  const communityIds = [...byCommunity.keys()];
  const admins = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
    })
    .from(communityMemberships)
    .where(
      and(
        inArray(communityMemberships.communityId, communityIds),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, ["owner", "admin"]),
      ),
    );

  const communityNames = new Map(
    (
      await db
        .select({ id: communities.id, name: communities.name })
        .from(communities)
        .where(inArray(communities.id, communityIds))
    ).map((c) => [c.id, c.name]),
  );

  const weekKey = isoWeekKey(now);
  const rows: (typeof notifications.$inferInsert)[] = admins.map((a) => ({
    userId: a.userId,
    type: "newcomer_churn_risk",
    title: "Newcomers about to lapse",
    content: `${byCommunity.get(a.communityId)} newcomer(s) in ${communityNames.get(a.communityId) ?? "your community"} joined ~3–4 weeks ago and haven't contributed yet. A warm welcome now can still activate them.`,
    communityId: a.communityId,
    metadata: { count: byCommunity.get(a.communityId), weekKey },
  }));
  if (rows.length) await db.insert(notifications).values(rows);

  return NextResponse.json({ success: true, notified: rows.length });
}

function isoWeekKey(d: Date): string {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${week}`;
}
