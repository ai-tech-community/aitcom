import { NextResponse } from "next/server";
import { and, eq, lt, or, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { rituals, ritualOccurrences } from "@/server/db/schema";
import { dateKey, isRitualDue } from "@/server/communities/rituals";
import { postRitualThread } from "@/server/communities/post-ritual-thread";

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
  const today = dateKey(now);
  let posted = 0;
  let pending = 0;

  const active = await db
    .select()
    .from(rituals)
    .where(eq(rituals.status, "active"))
    .limit(500);

  for (const r of active) {
    if (
      !isRitualDue(
        {
          weekday: r.weekday,
          status: r.status,
          lastFiredOn: r.lastFiredOn,
        },
        now,
      )
    ) {
      continue;
    }

    // CAS claim: only one runner flips lastFiredOn for today.
    const claimed = await db
      .update(rituals)
      .set({ lastFiredOn: today })
      .where(
        and(
          eq(rituals.id, r.id),
          or(isNull(rituals.lastFiredOn), lt(rituals.lastFiredOn, today)),
        ),
      )
      .returning({ id: rituals.id });
    if (claimed.length === 0) continue; // another runner won

    // Supersede any still-pending occurrence (heartbeat stays current).
    await db
      .update(ritualOccurrences)
      .set({ status: "skipped" })
      .where(
        and(
          eq(ritualOccurrences.ritualId, r.id),
          eq(ritualOccurrences.status, "pending"),
        ),
      );

    // Create the occurrence row; the unique (ritual_id, scheduled_for) index
    // absorbs a double-fire race.
    let occurrenceId: string;
    try {
      const [occ] = await db
        .insert(ritualOccurrences)
        .values({
          ritualId: r.id,
          communityId: r.communityId,
          scheduledFor: today,
          status: "pending",
        })
        .returning({ id: ritualOccurrences.id });
      occurrenceId = occ!.id;
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") continue; // race: occurrence for today already exists
      console.error(`rituals: occurrence insert failed for ${r.id}`, err);
      continue;
    }

    if (r.mode === "review") {
      pending++;
      continue;
    }

    try {
      const threadId = await postRitualThread(db, r);
      await db
        .update(ritualOccurrences)
        .set({ status: "posted", threadId, postedAt: new Date() })
        .where(eq(ritualOccurrences.id, occurrenceId));
      posted++;
    } catch (err) {
      console.error(`rituals: post failed for ${r.id}`, err);
      // leave the occurrence pending; it will be superseded on the next fire
    }
  }

  return NextResponse.json({ success: true, posted, pending, today });
}
