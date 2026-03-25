import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

async function requireRulesAcceptance(userId: string, communityId?: string) {
  if (!communityId) return;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "community-rules",
    where: { communityId: { equals: communityId } },
    limit: 1,
    depth: 0,
  });

  if (docs.length === 0) return;

  const rules = docs[0]!;

  const { docs: acceptanceDocs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
        { communityId: { equals: communityId } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  if (acceptanceDocs.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}

export const commentsRouter = createTRPCRouter({
  // ── List comments for an article ──────────────────────────────────────────

  list: publicProcedure
    .input(z.object({ articleId: z.number() }))
    .query(async ({ input }) => {
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "comments",
        where: { articleId: { equals: input.articleId } },
        sort: "createdAt",
        limit: 100,
        depth: 0,
      });

      return docs.map((doc) => ({
        id: doc.id,
        content: doc.content,
        parentId: doc.parentId ?? null,
        createdAt: doc.createdAt,
        authorId: doc.authorId,
        authorName: doc.authorName ?? null,
      }));
    }),

  // ── Create a comment ──────────────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        articleId: z.number(),
        content: z.string().min(1).max(5000),
        parentId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);

      const payload = await getPayloadClient();

      // Validate article exists and is published
      const article = await payload.findByID({
        collection: "articles",
        id: input.articleId,
        depth: 0,
      });

      if (article.status !== "published") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot comment on unpublished articles",
        });
      }

      // Validate parentId if provided (one-level threading)
      if (input.parentId !== undefined) {
        const parent = await payload.findByID({
          collection: "comments",
          id: input.parentId,
          depth: 0,
        });

        if (parent.articleId !== input.articleId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parent comment belongs to a different article",
          });
        }

        if (parent.parentId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot reply to a reply",
          });
        }
      }

      const comment = await payload.create({
        collection: "comments",
        data: {
          articleId: input.articleId,
          content: input.content,
          parentId: input.parentId ?? null,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? null,
        },
      });

      // Award XP
      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_COMMENT_CREATE);

      // Log activity
      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "comment.created",
        targetType: "articles",
        targetId: String(input.articleId),
        metadata: { articleTitle: article.title },
      });

      return {
        id: comment.id,
        content: comment.content,
        parentId: comment.parentId ?? null,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
        authorName: comment.authorName ?? null,
      };
    }),

  // ── Delete a comment ──────────────────────────────────────────────────────

  delete: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const comment = await payload.findByID({
        collection: "comments",
        id: input.commentId,
        depth: 0,
      });

      // Check authorization: comment author or Payload admin
      const isCommentAuthor = comment.authorId === ctx.session.user.id;
      let isAdmin = false;
      try {
        const { docs } = await payload.find({
          collection: "users",
          where: { email: { equals: ctx.session.user.email } },
          limit: 1,
          depth: 0,
        });
        isAdmin = docs[0]?.role === "admin";
      } catch {
        // Not a Payload user — not admin
      }

      if (!isCommentAuthor && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      // If top-level comment, cascade delete replies
      if (!comment.parentId) {
        await payload.delete({
          collection: "comments",
          where: { parentId: { equals: input.commentId } },
        });
      }

      await payload.delete({
        collection: "comments",
        id: input.commentId,
      });

      return { success: true };
    }),
});
