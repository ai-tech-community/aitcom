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
import { issueItemInputSchema } from "@/server/magazines/items/registry";
import {
  getMagazineForCommunity,
  saveMagazineSettings,
} from "@/server/magazines/magazine-service";
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
          logoUrl: input.logoUrl,
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
      };
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
