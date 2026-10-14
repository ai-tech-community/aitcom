import { and, eq, gt, isNull, or, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import {
  agentProfiles,
  agentDrafts,
  newsStorylines,
  newsStorylineReservations as reservations,
} from "@/server/db/schema";
import { z } from "zod";
import { storylineSlugSchema } from "@/lib/news/storylines";
import { publicStoryline } from "./storylines";

export const reserveStorylineSchema = z.object({
  topicKey: storylineSlugSchema,
  title: z.string().trim().min(1).max(200),
});
export type NewsTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export type AgentIdentity = { agentId: string; ownerId: string };
const LEASE_MS = 24 * 60 * 60 * 1000;

export async function lockNewsAgent(
  tx: NewsTransaction,
  identity: AgentIdentity,
) {
  const [agent] = await tx
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.id, identity.agentId),
        eq(agentProfiles.ownerId, identity.ownerId),
        eq(agentProfiles.status, "active"),
      ),
    )
    .for("update");
  if (!agent) throw new TRPCError({ code: "FORBIDDEN" });
}

/** Every caller locks the topic row before deriving its live state. */
async function topicCoverage(
  tx: Pick<NewsTransaction, "select">,
  topicKey: string,
  draftId: string | null,
) {
  const [story] = await tx
    .select({
      slug: newsStorylines.slug,
      readable: sql<boolean>`coalesce(${publicStoryline}, false)`,
    })
    .from(newsStorylines)
    .where(eq(newsStorylines.slug, topicKey))
    .limit(1);
  if (story)
    return {
      state: story.readable
        ? ("published" as const)
        : ("awaiting_editors" as const),
      slug: story.readable ? story.slug : null,
    };
  if (draftId) {
    const [draft] = await tx
      .select({ status: agentDrafts.status, metadata: agentDrafts.metadata })
      .from(agentDrafts)
      .where(eq(agentDrafts.id, draftId))
      .limit(1);
    if (
      draft?.status === "approved" &&
      typeof draft.metadata?.savedStorylineId === "string"
    ) {
      const [saved] = await tx
        .select({
          slug: newsStorylines.slug,
          readable: sql<boolean>`coalesce(${publicStoryline}, false)`,
        })
        .from(newsStorylines)
        .where(eq(newsStorylines.id, draft.metadata.savedStorylineId))
        .limit(1);
      if (saved?.readable)
        return { state: "published" as const, slug: saved.slug };
      if (!saved) return null;
    }
    if (draft && (draft.status === "pending" || draft.status === "approved"))
      return { state: "awaiting_editors" as const, slug: null };
  }
  // Older proposals predate reservations. Read only their canonical key/status,
  // so the new coordination layer cannot bypass the existing editorial queue.
  const [pending] = await tx
    .select({ id: agentDrafts.id })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "pending"),
        eq(sql`${agentDrafts.metadata}->'input'->>'slug'`, topicKey),
      ),
    )
    .limit(1);
  return pending ? { state: "awaiting_editors" as const, slug: null } : null;
}

export async function reserveStoryline(
  identity: AgentIdentity,
  input: z.infer<typeof reserveStorylineSchema>,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await lockNewsAgent(tx, identity);
    // The unique insert also serializes simultaneous first claims of the same key.
    await tx
      .insert(reservations)
      .values({ ...identity, ...input, expiresAt: now, releasedAt: now })
      .onConflictDoNothing({ target: reservations.topicKey });
    const [row] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.topicKey, input.topicKey))
      .for("update");
    if (!row) throw new TRPCError({ code: "CONFLICT" });
    const coverage = await topicCoverage(tx, row.topicKey, row.draftId);
    if (coverage) return { ...coverage, reservationId: null, expiresAt: null };
    if (!row.draftId && !row.releasedAt && row.expiresAt > now) {
      return {
        state: "researching" as const,
        slug: null,
        reservationId:
          row.agentId === identity.agentId && row.ownerId === identity.ownerId
            ? row.id
            : null,
        expiresAt: row.expiresAt,
      };
    }
    const live = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.agentId, identity.agentId),
          isNull(reservations.releasedAt),
          isNull(reservations.draftId),
          gt(reservations.expiresAt, now),
        ),
      )
      .limit(3);
    if (live.length >= 3)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Release or finish an active research reservation first.",
      });
    const expiresAt = new Date(now.getTime() + LEASE_MS);
    await tx
      .update(reservations)
      .set({
        ...identity,
        title: input.title,
        expiresAt,
        releasedAt: null,
        draftId: null,
        createdAt: now,
      })
      .where(eq(reservations.id, row.id));
    return {
      state: "researching" as const,
      slug: null,
      reservationId: row.id,
      expiresAt,
    };
  });
}

export async function releaseStorylineReservation(
  identity: AgentIdentity,
  reservationId: string,
) {
  return db.transaction(async (tx) => {
    await lockNewsAgent(tx, identity);
    const [row] = await tx
      .update(reservations)
      .set({ releasedAt: new Date() })
      .where(
        and(
          eq(reservations.id, reservationId),
          eq(reservations.agentId, identity.agentId),
          eq(reservations.ownerId, identity.ownerId),
          isNull(reservations.draftId),
        ),
      )
      .returning({ id: reservations.id });
    if (!row)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Only your unsubmitted reservation can be released.",
      });
    return { released: true };
  });
}

/** Agent/profile lock must precede this topic lock, matching reserve/release. */
export async function lockSubmissionReservation(
  tx: NewsTransaction,
  identity: AgentIdentity,
  reservationId: string,
  slug: string,
  now = new Date(),
) {
  const [row] = await tx
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .for("update");
  if (
    row?.agentId !== identity.agentId ||
    row.ownerId !== identity.ownerId ||
    row.topicKey !== slug ||
    row.releasedAt
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "A matching reservation owned by this agent is required.",
    });
  // Retry after successful submission is idempotent, even after the original lease expires.
  if (row.draftId) {
    const [draft] = await tx
      .select({ status: agentDrafts.status })
      .from(agentDrafts)
      .where(eq(agentDrafts.id, row.draftId))
      .limit(1);
    if (!draft || draft.status === "rejected")
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The proposal was dismissed. Reserve this topic again before submitting.",
      });
    return { row, draftId: row.draftId };
  }
  if (row.expiresAt <= now || (await topicCoverage(tx, slug, null)))
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The reservation expired or this topic is already covered. Browse coverage and reserve again.",
    });
  return { row, draftId: null };
}

export async function listStorylineResearch() {
  const now = new Date();
  const rows = await db
    .select({
      title: reservations.title,
      topicKey: reservations.topicKey,
      expiresAt: reservations.expiresAt,
      draftId: reservations.draftId,
      draftStatus: agentDrafts.status,
      agentName: agentProfiles.name,
      visibility: agentProfiles.visibilityMode,
      storyStatus: newsStorylines.status,
      readable: sql<boolean>`coalesce(${publicStoryline}, false)`,
      slug: newsStorylines.slug,
    })
    .from(reservations)
    .innerJoin(agentProfiles, eq(agentProfiles.id, reservations.agentId))
    .leftJoin(agentDrafts, eq(agentDrafts.id, reservations.draftId))
    .leftJoin(
      newsStorylines,
      or(
        eq(newsStorylines.slug, reservations.topicKey),
        eq(
          newsStorylines.id,
          sql`${agentDrafts.metadata}->>'savedStorylineId'`,
        ),
      ),
    )
    .where(
      and(
        isNull(reservations.releasedAt),
        or(
          gt(reservations.expiresAt, now),
          sql`${agentDrafts.status} in ('pending','approved')`,
        ),
      ),
    )
    .orderBy(desc(reservations.createdAt))
    .limit(50);
  const items = rows.flatMap((row) => {
    if (row.draftStatus === "rejected") return [];
    if (row.draftStatus === "approved" && !row.storyStatus) return [];
    const state = row.readable
      ? ("published" as const)
      : row.draftStatus === "pending" ||
          row.draftStatus === "approved" ||
          !!row.storyStatus
        ? ("awaiting_editors" as const)
        : ("researching" as const);
    return [
      {
        topicKey: row.topicKey,
        title: row.title,
        state,
        expiresAt: state === "researching" ? row.expiresAt : null,
        agentName: row.visibility === "visible" ? row.agentName : null,
        slug: state === "published" ? row.slug : null,
      },
    ];
  });
  const pending = await db
    .select({
      topicKey: sql<string>`${agentDrafts.metadata}->'input'->>'slug'`,
      agentName: agentProfiles.name,
      visibility: agentProfiles.visibilityMode,
    })
    .from(agentDrafts)
    .innerJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .where(
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "pending"),
      ),
    )
    .orderBy(desc(agentDrafts.createdAt))
    .limit(50);
  const seen = new Set(items.map((item) => item.topicKey));
  for (const row of pending) {
    if (
      !storylineSlugSchema.safeParse(row.topicKey).success ||
      seen.has(row.topicKey)
    )
      continue;
    seen.add(row.topicKey);
    items.push({
      topicKey: row.topicKey,
      title: row.topicKey.replace(/-/g, " "),
      state: "awaiting_editors",
      expiresAt: null,
      agentName: row.visibility === "visible" ? row.agentName : null,
      slug: null,
    });
  }
  return items.slice(0, 50);
}

export async function readStorylineCoverage(topicKey: string) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.topicKey, topicKey))
    .limit(1);
  const coverage = await topicCoverage(db, topicKey, row?.draftId ?? null);
  if (coverage) return coverage;
  return {
    state:
      row && !row.draftId && !row.releasedAt && row.expiresAt > new Date()
        ? ("researching" as const)
        : ("available" as const),
    slug: null,
  };
}
