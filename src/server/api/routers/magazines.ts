import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  ISSUE_VISIBILITIES,
  MAGAZINE_SLUG_PATTERN,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";
import type { Magazine, MagazineIssue } from "@/payload-types";
import { communityProcedure, createTRPCRouter } from "@/server/api/trpc";
import { isContentPublic } from "@/server/communities/content-visibility";
import type { Deps, PayloadClient } from "@/server/magazines/deps";
import { requireMagazineEditor } from "@/server/magazines/issue-access";
import {
  findIssueInCommunity,
  listMagazineIssues,
  loadEditorItems,
  loadIssueEditorView,
} from "@/server/magazines/issue-editing";
import {
  createIssue,
  deleteDraftIssue,
  type IssueActor,
  type IssueDetailsPatch,
  publishIssue,
  setIssueItems,
  updateIssueDetails,
} from "@/server/magazines/issue-service";
import { issueItemInputSchema } from "@/server/magazines/items/registry";
import {
  listAvailableArticles,
  listDraftArticles,
} from "@/server/magazines/magazine-articles";
import {
  getMagazineForCommunity,
  type MagazineCommunity,
  saveMagazineSettings,
} from "@/server/magazines/magazine-service";
import { getPayloadClient } from "@/server/payload";

/**
 * The magazine editor API (ADR-0042/0043). Every procedure is a community
 * procedure (input `slug` is the COMMUNITY slug) gated to magazine editors.
 * Procedures stay thin: parse, gate, load what the call names (refusing ids
 * of another community with NOT_FOUND), call the service. Services throw
 * `magazineError(code)`; the client maps codes to friendly text.
 */

/** Magazine and issue slugs: lower-case words and hyphens, 3–60 chars. */
const magazineSlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(MAGAZINE_SLUG_PATTERN);

const visibilitySchema = z.enum(ISSUE_VISIBILITIES);
const issueIdSchema = z.number().int().positive();
/** The `updatedAt` the editor's copy was loaded with (compare-and-set). */
const expectedUpdatedAtSchema = z.string().min(1);

const settingsInput = z.object({
  slug: z.string(),
  name: z.string().trim().min(1).max(120),
  // `slug` is taken by the community; the magazine's own slug is this one.
  magazineSlug: magazineSlugSchema,
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().nullable().optional(),
  // Normalized (trimmed, de-duplicated, cut to the maximum) by the service.
  topics: z
    .array(z.string().max(40))
    .max(MAX_MAGAZINE_TOPICS * 4)
    .default([]),
  defaultVisibility: visibilitySchema,
  confirmUnlistedPublic: z.boolean().optional(),
});

const issueRef = z.object({ slug: z.string(), issueId: issueIdSchema });

const issueWrite = issueRef.extend({
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

const issueDetailsInput = issueWrite.extend({
  title: z.string().trim().min(1).max(200).optional(),
  // Preflight F1: `slug` names the community, so the issue slug is
  // `issueSlug` here and `slug` in the service patch.
  issueSlug: magazineSlugSchema.optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  editorNote: z.unknown().optional(),
  visibility: visibilitySchema.optional(),
  confirmUnlistedPublic: z.boolean().optional(),
});

const MAX_ISSUE_ITEMS = 50;

/** Every procedure below: a community procedure for magazine editors only. */
const editorProcedure = communityProcedure.use(({ ctx, next }) => {
  requireMagazineEditor(ctx.communityRole);
  return next();
});

type EditorCtx = {
  db: Deps["db"];
  session: { user: { id: string } };
  community: { id: string; slug: string; isListedInDirectory: boolean };
};

async function depsOf(ctx: EditorCtx): Promise<Deps> {
  return { db: ctx.db, payload: await getPayloadClient() };
}

function communityOf(ctx: EditorCtx): MagazineCommunity {
  return {
    id: ctx.community.id,
    slug: ctx.community.slug,
    isListedInDirectory: ctx.community.isListedInDirectory,
  };
}

function actorOf(ctx: EditorCtx): IssueActor {
  return { userId: ctx.session.user.id, community: communityOf(ctx) };
}

async function requireMagazine(
  payload: PayloadClient,
  communityId: string,
): Promise<Magazine> {
  const magazine = await getMagazineForCommunity(payload, communityId);
  if (!magazine) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  return magazine;
}

async function requireIssue(
  payload: PayloadClient,
  issueId: number,
  communityId: string,
): Promise<MagazineIssue> {
  const issue = await findIssueInCommunity(payload, issueId, communityId);
  if (!issue) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
  }
  return issue;
}

export const magazinesRouter = createTRPCRouter({
  getSettings: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      const payload = await getPayloadClient();
      return {
        magazine: await getMagazineForCommunity(payload, ctx.community.id),
        communityIsPrivate: !isContentPublic(ctx.community),
        // What the settings form runs `planVisibilityChange` against, so it
        // asks for the opt-in exactly when the save would.
        community: {
          slug: ctx.community.slug,
          isListedInDirectory: ctx.community.isListedInDirectory,
        },
      };
    }),

  saveSettings: editorProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }) => {
      return saveMagazineSettings(
        await depsOf(ctx),
        communityOf(ctx),
        {
          name: input.name,
          slug: input.magazineSlug,
          description: input.description,
          logoUrl: input.logoUrl,
          topics: input.topics,
          defaultVisibility: input.defaultVisibility,
          confirmUnlistedPublic: input.confirmUnlistedPublic,
        },
        ctx.session.user.id,
      );
    }),

  listIssues: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      const payload = await getPayloadClient();
      const magazine = await getMagazineForCommunity(payload, ctx.community.id);
      return magazine ? listMagazineIssues(payload, magazine.id) : [];
    }),

  createIssue: editorProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().trim().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deps = await depsOf(ctx);
      const magazine = await requireMagazine(deps.payload, ctx.community.id);
      const issue = await createIssue(
        deps,
        magazine,
        { title: input.title },
        actorOf(ctx),
      );
      return { id: issue.id };
    }),

  getIssueForEditing: editorProcedure
    .input(issueRef)
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const issue = await requireIssue(
        payload,
        input.issueId,
        ctx.community.id,
      );
      return {
        ...(await loadIssueEditorView(payload, issue)),
        communityIsPrivate: !isContentPublic(ctx.community),
      };
    }),

  updateIssue: editorProcedure
    .input(issueDetailsInput)
    .mutation(async ({ ctx, input }) => {
      const deps = await depsOf(ctx);
      const issue = await requireIssue(
        deps.payload,
        input.issueId,
        ctx.community.id,
      );
      const patch: IssueDetailsPatch = {
        title: input.title,
        slug: input.issueSlug,
        coverImageUrl: input.coverImageUrl,
        editorNote: input.editorNote,
        visibility: input.visibility,
        confirmUnlistedPublic: input.confirmUnlistedPublic,
      };
      return updateIssueDetails(
        deps,
        issue,
        patch,
        input.expectedUpdatedAt,
        actorOf(ctx),
      );
    }),

  setIssueItems: editorProcedure
    .input(
      issueWrite.extend({
        items: z.array(issueItemInputSchema).max(MAX_ISSUE_ITEMS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deps = await depsOf(ctx);
      const issue = await requireIssue(
        deps.payload,
        input.issueId,
        ctx.community.id,
      );
      const saved = await setIssueItems(
        deps,
        issue,
        input.items,
        input.expectedUpdatedAt,
        actorOf(ctx),
      );
      return {
        issue: saved,
        items: await loadEditorItems(deps.payload, saved),
      };
    }),

  publishIssue: editorProcedure
    .input(issueWrite)
    .mutation(async ({ ctx, input }) => {
      const deps = await depsOf(ctx);
      const issue = await requireIssue(
        deps.payload,
        input.issueId,
        ctx.community.id,
      );
      return publishIssue(deps, issue, input.expectedUpdatedAt, actorOf(ctx));
    }),

  deleteDraftIssue: editorProcedure
    .input(issueRef)
    .mutation(async ({ ctx, input }) => {
      const deps = await depsOf(ctx);
      const issue = await requireIssue(
        deps.payload,
        input.issueId,
        ctx.community.id,
      );
      await deleteDraftIssue(deps, issue, actorOf(ctx));
      return { ok: true as const };
    }),

  availableArticles: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      const payload = await getPayloadClient();
      const magazine = await getMagazineForCommunity(payload, ctx.community.id);
      return magazine ? listAvailableArticles(payload, magazine.id) : [];
    }),

  myDraftArticles: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      const payload = await getPayloadClient();
      const magazine = await getMagazineForCommunity(payload, ctx.community.id);
      return magazine
        ? listDraftArticles(payload, magazine.id, ctx.session.user.id)
        : [];
    }),
});
