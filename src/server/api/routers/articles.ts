import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  isTrustedAuthor,
  awardXp,
  checkArticleBadges,
  XP_AMOUNTS,
} from "@/lib/gamification";

export const articlesRouter = createTRPCRouter({
  // ── My Articles ─────────────────────────────────────────────────────────────

  myArticles: protectedProcedure.query(async ({ ctx }) => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "articles",
      where: { authorId: { equals: ctx.session.user.id } },
      sort: "-updatedAt",
      limit: 50,
      depth: 0,
      draft: true,
    });
    return docs;
  }),

  // ── Get Single (for editing) ────────────────────────────────────────────────

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "articles",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 0,
        draft: true,
      });

      const article = docs[0];
      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }
      if (article.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      return article;
    }),

  // ── Create Draft ────────────────────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(255),
        slug: z.string().min(3).max(100),
        content: z.any(), // Lexical JSON state
        type: z.enum(["article", "tutorial"]),
        tags: z.array(z.object({ tag: z.string() })).optional(),
        mediaUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      // Generate unique slug
      const baseSlug = input.slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const article = await payload.create({
        collection: "articles",
        data: {
          title: input.title,
          slug,
          content: input.content,
          type: input.type,
          tags: input.tags ?? [],
          mediaUrl: input.mediaUrl ?? undefined,
          status: "draft",
          authorId: ctx.session.user.id,
          authorName: userName,
          authorType: "member",
        },
        draft: true,
      });

      return article;
    }),

  // ── Update Draft ────────────────────────────────────────────────────────────

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(3).max(255).optional(),
        content: z.any().optional(),
        type: z.enum(["article", "tutorial"]).optional(),
        tags: z.array(z.object({ tag: z.string() })).optional(),
        mediaUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      // Verify ownership
      const existing = await payload.findByID({
        collection: "articles",
        id: input.id,
        depth: 0,
        draft: true,
      });

      if (existing.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      // Only allow editing drafts, changes_requested, or if trusted author
      const profile = await ctx.db.query.memberProfiles.findFirst({
        where: eq(memberProfiles.userId, ctx.session.user.id),
      });
      const badges = await ctx.db
        .select()
        .from(memberBadges)
        .where(eq(memberBadges.userId, ctx.session.user.id));

      const trusted = profile ? isTrustedAuthor(profile.xp, badges) : false;

      if (existing.status === "published" && !trusted) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit published articles. Contact an admin.",
        });
      }

      if (
        existing.status !== "published" &&
        existing.status !== "draft" &&
        !["draft", "changes_requested"].includes(existing.reviewStatus ?? "")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Article is pending review and cannot be edited.",
        });
      }

      const { id, ...data } = input;

      const updated = await payload.update({
        collection: "articles",
        id,
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.mediaUrl !== undefined && {
            mediaUrl: data.mediaUrl ?? undefined,
          }),
          ...(existing.reviewStatus === "changes_requested" && {
            reviewStatus: null,
            reviewNote: null,
          }),
        },
        draft: existing.status === "draft",
      });

      return updated;
    }),

  // ── Submit for Review / Publish ─────────────────────────────────────────────

  submit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const article = await payload.findByID({
        collection: "articles",
        id: input.id,
        depth: 0,
        draft: true,
      });

      if (article.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      if (article.authorType !== "member") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only member articles can be submitted",
        });
      }

      // Check if trusted author
      const profile = await ctx.db.query.memberProfiles.findFirst({
        where: eq(memberProfiles.userId, ctx.session.user.id),
      });
      const badges = await ctx.db
        .select()
        .from(memberBadges)
        .where(eq(memberBadges.userId, ctx.session.user.id));

      const trusted = profile ? isTrustedAuthor(profile.xp, badges) : false;

      if (trusted) {
        // Direct publish
        const published = await payload.update({
          collection: "articles",
          id: input.id,
          data: {
            status: "published",
            reviewStatus: "approved",
            publishedAt: new Date().toISOString(),
          },
        });

        await awardXp(
          ctx.db,
          ctx.session.user.id,
          XP_AMOUNTS.ARTICLE_PUBLISHED,
        );

        const { totalDocs } = await payload.find({
          collection: "articles",
          where: {
            and: [
              { authorId: { equals: ctx.session.user.id } },
              { status: { equals: "published" } },
            ],
          },
          limit: 0,
          depth: 0,
        });
        await checkArticleBadges(
          ctx.db,
          ctx.session.user.id,
          totalDocs,
          article.type,
        );

        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "article.published",
          targetType: "articles",
          targetId: String(input.id),
          metadata: { title: article.title, type: article.type },
        });

        return published;
      } else {
        // Submit for review
        const submitted = await payload.update({
          collection: "articles",
          id: input.id,
          data: {
            reviewStatus: "pending_review",
          },
        });

        // Award submit XP only on first submit
        if (!article.reviewStatus) {
          await awardXp(
            ctx.db,
            ctx.session.user.id,
            XP_AMOUNTS.ARTICLE_SUBMITTED,
          );
        }

        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "article.submitted",
          targetType: "articles",
          targetId: String(input.id),
          metadata: { title: article.title, type: article.type },
        });

        return submitted;
      }
    }),

  // ── Delete Draft ────────────────────────────────────────────────────────────

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const article = await payload.findByID({
        collection: "articles",
        id: input.id,
        depth: 0,
        draft: true,
      });

      if (article.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your article" });
      }

      if (article.status === "published") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete published articles.",
        });
      }

      await payload.delete({ collection: "articles", id: input.id });
      return { success: true };
    }),
});
