import { and, count, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import {
  agentDrafts,
  agentProfiles,
  newsItems,
  newsStorylineReservations,
} from "@/server/db/schema";
import {
  lockNewsAgent,
  lockSubmissionReservation,
} from "./storyline-reservations";
import { storylineDraftReviewPath } from "@/lib/news/storyline-draft-review";
import { storylineInputSchema } from "@/lib/news/storylines";
import {
  validateStorylineProposals,
  type StorylineSuggestion,
  type storylineProposalSchema,
} from "@/lib/news/storyline-suggestions";
import type { z } from "zod";
import { notifyStorylineDraftReview } from "./storyline-draft-notify";

export const NEWS_STORYLINE_DRAFT_TYPE = "news_storyline";
const MAX_PENDING = 10;

export type AgentStorylineSuggestion = StorylineSuggestion & {
  draftId: string;
  agentName: string;
  agentId: string;
  ownerId: string;
  submittedAt: Date;
};

export async function submitAgentStoryline(
  identity: { agentId: string; ownerId: string },
  proposal: z.infer<typeof storylineProposalSchema>,
  reservationId: string,
) {
  const result = await db.transaction(async (tx) => {
    await lockNewsAgent(tx, identity);
    const reservation = await lockSubmissionReservation(
      tx,
      identity,
      reservationId,
      proposal.slug,
    );
    if (reservation.draftId)
      return {
        mode: "draft" as const,
        draftId: reservation.draftId,
        reused: true,
      };
    const articles = await tx
      .select({
        id: newsItems.id,
        title: newsItems.title,
        url: newsItems.url,
        summary: newsItems.summary,
        author: newsItems.author,
        publishedAt: newsItems.publishedAt,
      })
      .from(newsItems)
      .where(
        inArray(
          newsItems.id,
          proposal.articles.map((m) => m.articleId),
        ),
      );
    const valid = validateStorylineProposals(
      { proposals: [proposal] },
      articles,
    );
    if (!valid.drafts.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Article references and evidence must match collected source reporting.",
      });
    const input = valid.drafts[0]!.input;
    const pending = await tx
      .select()
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.agentId, identity.agentId),
          eq(agentDrafts.type, NEWS_STORYLINE_DRAFT_TYPE),
          eq(agentDrafts.status, "pending"),
        ),
      )
      .limit(MAX_PENDING);
    const signature = input.articles.map((m) => m.articleId).sort();
    const articleSignature = JSON.stringify(signature);
    const duplicate = pending.find(
      (d) => d.metadata?.articleSignature === articleSignature,
    );
    if (duplicate)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "These articles already have a proposal. Release the duplicate topic reservation.",
      });
    if (pending.length >= MAX_PENDING)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "Review or dismiss pending news proposals before submitting more.",
      });
    const draftId = crypto.randomUUID();
    const [draft] = await tx
      .insert(agentDrafts)
      .values({
        id: draftId,
        agentId: identity.agentId,
        ownerId: identity.ownerId,
        type: NEWS_STORYLINE_DRAFT_TYPE,
        targetType: "news",
        status: "pending",
        content: `${input.titleEn}\n\n${input.overviewEn}`,
        metadata: {
          input,
          articleSignature,
          topicKey: proposal.slug,
          title: input.titleEn,
          destinationLabel: "News storylines · editorial review",
          destinationPath: storylineDraftReviewPath(draftId),
        },
      })
      .returning({ id: agentDrafts.id });
    await tx
      .update(newsStorylineReservations)
      .set({ draftId: draft!.id })
      .where(eq(newsStorylineReservations.id, reservation.row.id));
    return { mode: "draft" as const, draftId: draft!.id, reused: false };
  });
  if (!result.reused) {
    try {
      await notifyStorylineDraftReview({
        draftId: result.draftId,
        ownerId: identity.ownerId,
        title: proposal.titleEn,
      });
    } catch (err) {
      console.error("news: storyline draft notification failed", err);
    }
  }
  return result;
}

/** Staff-only caller. Every imported input is revalidated against current sources. */
export async function listAgentStorylineDrafts(requestedPage: number) {
  const where = and(
    eq(agentDrafts.type, NEWS_STORYLINE_DRAFT_TYPE),
    eq(agentDrafts.status, "pending"),
  );
  const [totalRow] = await db
    .select({ total: count() })
    .from(agentDrafts)
    .where(where);
  const totalPages = Math.max(1, Math.ceil((totalRow?.total ?? 0) / 12));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const drafts = await db
    .select({ draft: agentDrafts, agentName: agentProfiles.name })
    .from(agentDrafts)
    .innerJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .where(where)
    .orderBy(desc(agentDrafts.createdAt), agentDrafts.id)
    .limit(12)
    .offset((page - 1) * 12);
  const parsed = drafts.flatMap((row) => {
    const input = storylineInputSchema.safeParse(row.draft.metadata?.input);
    return input.success ? [{ ...row, input: input.data }] : [];
  });
  const invalidItems: Array<{
    draftId: string;
    agentName: string;
    title: string;
  }> = [];
  const parsedIds = new Set(parsed.map((row) => row.draft.id));
  for (const row of drafts)
    if (!parsedIds.has(row.draft.id))
      invalidItems.push({
        draftId: row.draft.id,
        agentName: row.agentName,
        title: row.draft.content.split("\n")[0]?.slice(0, 200) ?? "",
      });
  const ids = [
    ...new Set(parsed.flatMap((p) => p.input.articles.map((m) => m.articleId))),
  ];
  const articles = ids.length
    ? await db
        .select({
          id: newsItems.id,
          title: newsItems.title,
          url: newsItems.url,
          summary: newsItems.summary,
          author: newsItems.author,
          publishedAt: newsItems.publishedAt,
        })
        .from(newsItems)
        .where(inArray(newsItems.id, ids))
    : [];
  const items: AgentStorylineSuggestion[] = [];
  for (const row of parsed) {
    const valid = validateStorylineProposals(
      { proposals: [row.input] },
      articles,
    );
    const suggestion = valid.drafts[0];
    if (!suggestion) {
      invalidItems.push({
        draftId: row.draft.id,
        agentName: row.agentName,
        title: row.input.titleEn,
      });
      continue;
    }
    items.push({
      ...suggestion,
      input: { ...suggestion.input, sourceDraftId: row.draft.id },
      draftId: row.draft.id,
      agentName: row.agentName,
      agentId: row.draft.agentId,
      ownerId: row.draft.ownerId,
      submittedAt: row.draft.createdAt,
    });
  }
  return { items, invalidItems, page, totalPages };
}

/** Called only by the staff procedure; owners may also retract through their draft inbox. */
export async function dismissAgentStorylineDraft(draftId: string) {
  const [dismissed] = await db
    .update(agentDrafts)
    .set({ status: "rejected" })
    .where(
      and(
        eq(agentDrafts.id, draftId),
        eq(agentDrafts.type, NEWS_STORYLINE_DRAFT_TYPE),
        eq(agentDrafts.status, "pending"),
      ),
    )
    .returning({ id: agentDrafts.id });
  if (!dismissed)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This proposal is no longer pending.",
    });
  return { id: dismissed.id };
}
