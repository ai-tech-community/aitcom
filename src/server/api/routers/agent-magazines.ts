import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { MAGAZINE_ROLES } from "@/lib/magazines/roles";
import {
  ISSUE_VISIBILITIES,
  MAGAZINE_SLUG_PATTERN,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";
import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import { communities } from "@/server/db/schema";
import { uploadMagazineImage } from "@/server/magazines/agent-image";
import {
  browseMagazines,
  markArticleReady,
  saveMagazineArticle,
  saveMagazineIssue,
  submitAgentIssue,
} from "@/server/magazines/agent-magazine";
import {
  loadMagazineEditorship,
  requireCapability,
} from "@/server/magazines/editorship";
import { magazineError } from "@/server/magazines/errors";
import { findMagazineBySlug } from "@/server/magazines/reading";
import { requireRelationId } from "@/server/magazines/relation-id";
import { issueItemInputSchema } from "@/server/magazines/items/registry";
import {
  getMagazineForCommunity,
  saveMagazineSettings,
  updateMagazineImages,
} from "@/server/magazines/magazine-service";
import { proposeMagazineDelete } from "@/server/magazines/magazine-delete";
import { resolveContentImage } from "@/server/magazines/magazine-issue-update";
import { assignMagazineRole } from "@/server/magazines/staff-service";
import { getPayloadClient } from "@/server/payload";

const magazineSlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(MAGAZINE_SLUG_PATTERN);

const httpUrl = z
  .string()
  .url()
  .max(2000)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    {
      message: "Use an http(s) image URL",
    },
  );

async function depsOf(ctx: {
  db: Parameters<typeof browseMagazines>[0]["db"];
}) {
  return { db: ctx.db, payload: await getPayloadClient() };
}

export const agentMagazineRouter = {
  browseMagazines: agentProcedure
    .input(
      z.object({
        magazineSlug: z.string().min(1).max(80).optional(),
        communitySlug: z.string().min(1).max(80).optional(),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      return browseMagazines(
        await depsOf(ctx),
        { agentId: ctx.agent.agentId, ownerId: ctx.agent.ownerId },
        input,
      );
    }),

  saveMagazineArticle: agentProcedure
    .input(
      z.object({
        magazineSlug: z.string().min(1).max(80),
        articleId: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        body: z.string().min(1).max(50_000).optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        videoUrl: z
          .string()
          .url()
          .max(2000)
          .refine(
            (value) =>
              value.startsWith("https://") || value.startsWith("http://"),
            { message: "Use an http(s) video URL" },
          )
          .optional()
          .describe(
            "Page URL stored as a video block. YouTube and Vimeo play inline. Schooltv and other pages become a link card.",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      return saveMagazineArticle(
        await depsOf(ctx),
        { agentId: ctx.agent.agentId, ownerId },
        input,
      );
    }),

  uploadImage: agentProcedure
    .input(
      z
        .object({
          magazineSlug: z.string().min(1).max(80),
          alt: z.string().max(200).optional(),
          url: httpUrl.optional(),
          dataBase64: z.string().min(1).max(4_000_000).optional(),
          contentType: z.string().max(100).optional(),
        })
        .refine(
          (input) =>
            Boolean(input.url) !==
            Boolean(input.dataBase64 && input.contentType),
          {
            message:
              "Send either a URL or base64 image data with a content type.",
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const { payload } = await depsOf(ctx);
      return uploadMagazineImage(payload, ownerId, input);
    }),

  saveMagazineIssue: agentProcedure
    .input(
      z.object({
        magazineSlug: z.string().min(1).max(80),
        issueId: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        coverMediaId: z.number().int().positive().nullable().optional(),
        coverAlt: z.string().max(200).nullable().optional(),
        articleIds: z.array(z.number().int().positive()).max(50).optional(),
        items: z.array(issueItemInputSchema).max(50).optional(),
        editorNote: z.unknown().nullable().optional(),
        expectedUpdatedAt: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      return saveMagazineIssue(
        await depsOf(ctx),
        { agentId: ctx.agent.agentId, ownerId },
        input,
      );
    }),

  createMagazine: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(120),
        magazineSlug: magazineSlugSchema,
        description: z.string().max(500).optional(),
        logoUrl: httpUrl.nullable().optional(),
        logoMediaId: z.number().int().positive().nullable().optional(),
        logoAlt: z.string().max(200).nullable().optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        coverMediaId: z.number().int().positive().nullable().optional(),
        coverAlt: z.string().max(200).nullable().optional(),
        topics: z
          .array(z.string().max(40))
          .max(MAX_MAGAZINE_TOPICS * 4)
          .default([]),
        defaultVisibility: z.enum(ISSUE_VISIBILITIES).default("members"),
        confirmUnlistedPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: {
          id: true,
          slug: true,
          name: true,
          isListedInDirectory: true,
        },
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }
      const deps = await depsOf(ctx);
      const existing = await getMagazineForCommunity(
        deps.payload,
        community.id,
      );
      if (existing) throw magazineError("MAGAZINE_EXISTS");
      const standing = await loadMagazineEditorship(
        ctx.db,
        { communityId: community.id, magazineId: null },
        ownerId,
      );
      requireCapability(standing, "manage");
      const logo = await resolveContentImage(deps.payload, ownerId, {
        mediaId: input.logoMediaId,
        url: input.logoUrl,
        alt: input.logoAlt,
      });
      const cover = await resolveContentImage(deps.payload, ownerId, {
        mediaId: input.coverMediaId,
        url: input.coverImageUrl,
        alt: input.coverAlt,
      });
      const magazine = await saveMagazineSettings(
        deps,
        {
          id: community.id,
          slug: community.slug,
          isListedInDirectory: community.isListedInDirectory,
        },
        {
          name: input.name,
          slug: input.magazineSlug,
          description: input.description,
          logoUrl: logo?.url ?? input.logoUrl ?? null,
          ...(logo
            ? {
                logoMediaId: logo.mediaId ?? null,
                logoAlt: logo.alt ?? null,
              }
            : {}),
          ...(cover
            ? {
                coverImageUrl: cover.url ?? null,
                coverMediaId: cover.mediaId ?? null,
                coverAlt: cover.alt ?? null,
              }
            : {}),
          topics: input.topics,
          defaultVisibility: input.defaultVisibility,
          confirmUnlistedPublic: input.confirmUnlistedPublic,
        },
        ownerId,
        standing.leadsCommunity,
      );
      return {
        id: magazine.id,
        slug: magazine.slug,
        name: magazine.name,
        communityId: magazine.communityId,
        logoUrl: magazine.logoUrl ?? null,
        logoMediaId: magazine.logoMediaId ?? null,
        logoAlt: magazine.logoAlt ?? null,
        coverImageUrl: magazine.coverImageUrl ?? null,
        coverMediaId: magazine.coverMediaId ?? null,
        coverAlt: magazine.coverAlt ?? null,
      };
    }),

  updateMagazine: agentProcedure
    .input(
      z.object({
        magazineSlug: z.string().min(1).max(80),
        logoUrl: httpUrl.nullable().optional(),
        logoMediaId: z.number().int().positive().nullable().optional(),
        logoAlt: z.string().max(200).nullable().optional(),
        coverImageUrl: httpUrl.nullable().optional(),
        coverMediaId: z.number().int().positive().nullable().optional(),
        coverAlt: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const deps = await depsOf(ctx);
      const magazine = await findMagazineBySlug(
        deps.payload,
        input.magazineSlug,
      );
      if (!magazine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Magazine not found",
        });
      }
      const logo = await resolveContentImage(deps.payload, ownerId, {
        mediaId: input.logoMediaId,
        url: input.logoUrl,
        alt: input.logoAlt,
      });
      const cover = await resolveContentImage(deps.payload, ownerId, {
        mediaId: input.coverMediaId,
        url: input.coverImageUrl,
        alt: input.coverAlt,
      });
      if (!logo && !cover) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Send a logo or a cover.",
        });
      }
      const standing = await loadMagazineEditorship(
        ctx.db,
        { communityId: magazine.communityId, magazineId: magazine.id },
        ownerId,
      );
      requireCapability(standing, "manage");
      const saved = await updateMagazineImages(deps.payload, magazine.id, {
        ...(logo?.url !== undefined ? { logoUrl: logo.url } : {}),
        ...(logo?.mediaId !== undefined ? { logoMediaId: logo.mediaId } : {}),
        ...(logo?.alt !== undefined ? { logoAlt: logo.alt } : {}),
        ...(cover?.url !== undefined ? { coverImageUrl: cover.url } : {}),
        ...(cover?.mediaId !== undefined
          ? { coverMediaId: cover.mediaId }
          : {}),
        ...(cover?.alt !== undefined ? { coverAlt: cover.alt } : {}),
      });
      return {
        id: saved.id,
        slug: saved.slug,
        logoUrl: saved.logoUrl ?? null,
        logoMediaId: saved.logoMediaId ?? null,
        logoAlt: saved.logoAlt ?? null,
        coverImageUrl: saved.coverImageUrl ?? null,
        coverMediaId: saved.coverMediaId ?? null,
        coverAlt: saved.coverAlt ?? null,
      };
    }),

  deleteMagazineIssue: agentProcedure
    .input(
      z.object({
        magazineSlug: z.string().min(1).max(80),
        issueId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const deps = await depsOf(ctx);
      const magazine = await findMagazineBySlug(
        deps.payload,
        input.magazineSlug,
      );
      if (!magazine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Magazine not found",
        });
      }
      const issue = await deps.payload.findByID({
        collection: "magazine-issues",
        id: input.issueId,
        depth: 0,
      });
      if (requireRelationId(issue.magazine) !== magazine.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
      }
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.id, magazine.communityId),
          isNull(communities.deletedAt),
        ),
        columns: { id: true, slug: true },
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }
      return proposeMagazineDelete(
        deps,
        { agentId: ctx.agent.agentId, ownerId },
        {
          collection: "magazine-issues",
          id: issue.id,
          magazineId: magazine.id,
          magazineSlug: magazine.slug,
          communityId: community.id,
          communitySlug: community.slug,
          title: issue.title,
        },
      );
    }),

  deleteMagazineArticle: agentProcedure
    .input(
      z.object({
        magazineSlug: z.string().min(1).max(80),
        articleId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const deps = await depsOf(ctx);
      const magazine = await findMagazineBySlug(
        deps.payload,
        input.magazineSlug,
      );
      if (!magazine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Magazine not found",
        });
      }
      const article = await deps.payload.findByID({
        collection: "articles",
        id: input.articleId,
        depth: 0,
      });
      const articleMagazine =
        typeof article.magazine === "number"
          ? article.magazine
          : (article.magazine?.id ?? null);
      if (articleMagazine !== magazine.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.id, magazine.communityId),
          isNull(communities.deletedAt),
        ),
        columns: { id: true, slug: true },
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }
      return proposeMagazineDelete(
        deps,
        { agentId: ctx.agent.agentId, ownerId },
        {
          collection: "articles",
          id: article.id,
          magazineId: magazine.id,
          magazineSlug: magazine.slug,
          communityId: community.id,
          communitySlug: community.slug,
          title: article.title,
        },
      );
    }),

  assignMagazineAgent: agentProcedure
    .input(
      z.object({
        communitySlug: z.string().min(1).max(80),
        userId: z.string().min(1).max(255),
        agentId: z.string().min(1).max(255),
        role: z.enum(MAGAZINE_ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true, slug: true, name: true },
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }
      const deps = await depsOf(ctx);
      const magazine = await getMagazineForCommunity(
        deps.payload,
        community.id,
      );
      if (!magazine) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This community has no magazine yet.",
        });
      }
      const standing = await loadMagazineEditorship(
        ctx.db,
        { communityId: community.id, magazineId: magazine.id },
        ownerId,
      );
      requireCapability(standing, "manage");
      return assignMagazineRole(
        ctx.db,
        {
          id: magazine.id,
          name: magazine.name,
          communityId: community.id,
        },
        { userId: input.userId, agentId: input.agentId, role: input.role },
        {
          userId: ownerId,
          community: { id: community.id, slug: community.slug },
        },
      );
    }),

  markArticleReady: agentProcedure
    .input(z.object({ articleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      return markArticleReady(
        await depsOf(ctx),
        { agentId: ctx.agent.agentId, ownerId },
        input.articleId,
      );
    }),

  submitIssueForReview: agentProcedure
    .input(z.object({ issueId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      return submitAgentIssue(
        await depsOf(ctx),
        { agentId: ctx.agent.agentId, ownerId },
        input.issueId,
      );
    }),
};
