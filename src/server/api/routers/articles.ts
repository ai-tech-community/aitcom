import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedAuthor, awardXp, XP_AMOUNTS } from "@/lib/gamification";
import type { Article } from "@/payload-types";
import { onArticleApproved } from "@/server/badges/article-approved";
import {
  channelFor,
  isArticleMagazineLocked,
} from "@/server/articles/channels";
import type { Deps, PayloadClient } from "@/server/magazines/deps";
import { assertArticleNotPlaced } from "@/server/magazines/article-placement";
import { magazineError } from "@/server/magazines/errors";
import { requireMagazineCapability } from "@/server/magazines/magazine-articles";
import {
  deleteMagazineArticle,
  saveMagazineArticle,
  submitMagazineArticle,
  type ArticlePatch,
} from "@/server/magazines/article-submission";

type MemberCtx = {
  db: Deps["db"];
  session: { user: { id: string; name?: string | null } };
};

/** Whether the caller is a trusted author (may publish blog articles directly). */
async function isTrustedMember(ctx: MemberCtx): Promise<boolean> {
  const profile = await ctx.db.query.memberProfiles.findFirst({
    where: eq(memberProfiles.userId, ctx.session.user.id),
  });
  if (!profile) return false;
  const badges = await ctx.db
    .select()
    .from(memberBadges)
    .where(eq(memberBadges.userId, ctx.session.user.id));
  return isTrustedAuthor(profile.xp, badges);
}

/**
 * Runs an article write, turning the Articles hook's channel lock (a plain
 * Error thrown inside Payload's save) into the magazine refusal code.
 */
async function articleWrite<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isArticleMagazineLocked(error)) {
      throw magazineError("ARTICLE_MAGAZINE_LOCKED");
    }
    throw error;
  }
}

/** The blog's published edits still require a trusted author. */
async function assertMayEditBlog(
  ctx: MemberCtx,
  existing: Article,
): Promise<void> {
  if (existing.status === "published" && !(await isTrustedMember(ctx))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot edit published articles. Contact an admin.",
    });
  }
}

/**
 * The blog's submit: a trusted author publishes directly; anyone else goes
 * to the staff review queue (submit XP on the first submit).
 */
async function submitForStaffReview(
  ctx: MemberCtx,
  payload: PayloadClient,
  article: Article,
): Promise<Article> {
  const userId = ctx.session.user.id;

  if (await isTrustedMember(ctx)) {
    // Direct publish
    const published = await articleWrite(() =>
      payload.update({
        collection: "articles",
        id: article.id,
        data: {
          status: "published",
          reviewStatus: "approved",
          publishedAt: new Date().toISOString(),
        },
      }),
    );

    // Approval XP comes from the Articles collection hook, which this
    // update triggers. The hook also evaluates badges when the review
    // status changed; earning is idempotent, and this covers a
    // re-publish of an article approved before.
    await onArticleApproved(ctx.db, { authorId: userId, type: article.type });

    await logActivity(ctx.db, {
      actorId: userId,
      actorType: "member",
      action: "article.published",
      targetType: "articles",
      targetId: String(article.id),
      metadata: { title: article.title, type: article.type },
    });

    return published;
  }

  // Submit for review
  const submitted = await articleWrite(() =>
    payload.update({
      collection: "articles",
      id: article.id,
      data: { reviewStatus: "pending_review" },
    }),
  );

  // Award submit XP only on first submit
  if (!article.reviewStatus) {
    await awardXp(ctx.db, userId, XP_AMOUNTS.ARTICLE_SUBMITTED);
  }

  await logActivity(ctx.db, {
    actorId: userId,
    actorType: "member",
    action: "article.submitted",
    targetType: "articles",
    targetId: String(article.id),
    metadata: { title: article.title, type: article.type },
  });

  return submitted;
}

export const articlesRouter = createTRPCRouter({
  // ── My Articles ─────────────────────────────────────────────────────────────

  myArticles: protectedProcedure.query(async ({ ctx }) => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "articles",
      // The blog's list: magazine articles live on their magazine's tab.
      where: {
        and: [
          { authorId: { equals: ctx.session.user.id } },
          { magazine: { exists: false } },
        ],
      },
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
        /** Write for this community magazine instead of the blog. */
        magazineId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      // The channel is fixed here, once: the magazine grants write to its team.
      const magazine =
        input.magazineId === undefined
          ? null
          : (
              await requireMagazineCapability(
                { db: ctx.db, payload },
                input.magazineId,
                ctx.session.user.id,
                "write",
              )
            ).magazine;

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
          ...(magazine && { magazine: magazine.id }),
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

      const { id, ...data } = input;
      const patch: ArticlePatch = {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.mediaUrl !== undefined && {
          mediaUrl: data.mediaUrl ?? undefined,
        }),
      };

      const policy = channelFor(existing).editPolicy;
      switch (policy) {
        case "magazine":
          return articleWrite(() =>
            saveMagazineArticle(
              { db: ctx.db, payload },
              id,
              ctx.session.user.id,
              patch,
            ),
          );
        case "trusted_author": {
          await assertMayEditBlog(ctx, existing);

          if (
            existing.status !== "published" &&
            existing.status !== "draft" &&
            !["draft", "changes_requested"].includes(
              existing.reviewStatus ?? "",
            )
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Article is pending review and cannot be edited.",
            });
          }

          const updated = await articleWrite(() =>
            payload.update({
              collection: "articles",
              id,
              data: {
                ...patch,
                ...(existing.reviewStatus === "changes_requested" && {
                  reviewStatus: null,
                  reviewNote: null,
                }),
              },
              draft: existing.status === "draft",
            }),
          );

          return updated;
        }
        default: {
          const unreachable: never = policy;
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exhaustive policy: this branch is unreachable.
          throw unreachable;
        }
      }
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

      // How an article is handed in is the channel's call (ADR-0043).
      const policy = channelFor(article).submitPolicy;
      switch (policy) {
        case "staff_review":
          return submitForStaffReview(ctx, payload, article);
        case "magazine_review":
          return articleWrite(() =>
            submitMagazineArticle(
              { db: ctx.db, payload },
              article,
              ctx.session.user.id,
            ),
          );
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

      const policy = channelFor(article).editPolicy;
      switch (policy) {
        case "magazine":
          await articleWrite(() =>
            deleteMagazineArticle(
              { db: ctx.db, payload },
              article.id,
              ctx.session.user.id,
            ),
          );
          return { success: true };
        case "trusted_author": {
          if (article.status === "published") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Cannot delete published articles.",
            });
          }

          // An issue still holds it: the editor takes it out first. (The
          // Articles beforeDelete hook guards every other delete path.)
          await assertArticleNotPlaced(payload, input.id);

          await payload.delete({ collection: "articles", id: input.id });
          return { success: true };
        }
        default: {
          const unreachable: never = policy;
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exhaustive policy: this branch is unreachable.
          throw unreachable;
        }
      }
    }),
});
