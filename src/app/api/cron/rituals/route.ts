import { NextResponse } from "next/server";
import { and, eq, lt, or, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { rituals, ritualOccurrences, user } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { logActivity } from "@/server/agent/activity";
import { dateKey, isRitualDue } from "@/server/communities/rituals";

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
    .where(eq(rituals.status, "active"));

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
          status: r.mode === "auto" ? "posted" : "pending",
        })
        .returning({ id: ritualOccurrences.id });
      occurrenceId = occ!.id;
    } catch {
      continue; // occurrence for today already exists
    }

    if (r.mode === "review") {
      pending++;
      continue;
    }

    const threadId = await postRitualThread(r);
    await db
      .update(ritualOccurrences)
      .set({ status: "posted", threadId, postedAt: new Date() })
      .where(eq(ritualOccurrences.id, occurrenceId));
    posted++;
  }

  return NextResponse.json({ success: true, posted, pending, today });
}

/** Materialise a ritual as a forum thread authored by the ritual owner. */
async function postRitualThread(r: {
  id: string;
  communityId: string;
  authorUserId: string;
  title: string;
  body: string;
  category: string;
}): Promise<number> {
  const payload = await getPayloadClient();
  const baseSlug = r.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const slug = `${baseSlug}-${Date.now()}`;

  const [author] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, r.authorUserId))
    .limit(1);

  const thread = await payload.create({
    collection: "forum-threads",
    data: {
      title: r.title,
      slug,
      content: plainTextToLexical(r.body),
      category: r.category as "general" | "question" | "showcase" | "job",
      authorId: r.authorUserId,
      authorName: author?.name ?? "organizer",
      authorRole: "member",
      isPinned: false,
      isLocked: false,
      replyCount: 0,
      lastActivityAt: new Date().toISOString(),
      communityId: r.communityId,
    },
  });

  await logActivity(db, {
    actorId: r.authorUserId,
    actorType: "member",
    action: "thread.create",
    targetType: "forum-threads",
    targetId: String(thread.id),
    communityId: r.communityId,
    metadata: { title: r.title, category: r.category, slug, ritualId: r.id },
  });

  return Number(thread.id);
}
