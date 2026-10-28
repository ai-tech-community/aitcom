import { z } from "zod";

import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import { issueItemInputSchema } from "@/server/magazines/items/registry";
import { uploadMagazineImage } from "@/server/magazines/agent-image";
import {
  browseMagazines,
  saveMagazineArticle,
  saveMagazineIssue,
  submitAgentIssue,
} from "@/server/magazines/agent-magazine";
import { getPayloadClient } from "@/server/payload";

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
