import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import {
  PICKABLE_ITEM_KINDS,
  PICKER_EXCLUDE_LIMIT,
} from "@/lib/magazines/picker";
import {
  ISSUE_VISIBILITIES,
  MAGAZINE_SLUG_PATTERN,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";
import type { Magazine } from "@/payload-types";
import { communityProcedure, createTRPCRouter } from "@/server/api/trpc";
import { isContentPublic } from "@/server/communities/content-visibility";
import type { Deps, PayloadClient } from "@/server/magazines/deps";
import {
  loadMagazineEditorship,
  requireEditorStanding,
} from "@/server/magazines/editorship";
import {
  findIssueInCommunity,
  listMagazineIssues,
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
import { searchPickerCandidates } from "@/server/magazines/items/pickers";
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

/**
 * Every procedure below: a community procedure for magazine editors only,
 * gated by the editorship seam. The community's magazine (null until the
 * first settings save creates it) and the Payload client go on `ctx`.
 */
const editorProcedure = communityProcedure.use(async ({ ctx, next }) => {
  const payload = await getPayloadClient();
  const magazine = await getMagazineForCommunity(payload, ctx.community.id);
  requireEditorStanding(
    await loadMagazineEditorship(
      ctx.db,
      { communityId: ctx.community.id, magazineId: magazine?.id ?? null },
      ctx.session.user.id,
    ),
  );
  return next({ ctx: { payload, magazine } });
});

/**
 * An editor procedure on one issue of THIS community: the issue is loaded
 * here and put on `ctx`, and an id of another community's issue (or of no
 * issue) is NOT_FOUND. Every issue-scoped procedure is built on it, so the
 * community boundary is structural, not a call each procedure must
 * remember.
 */
const issueProcedure = editorProcedure
  .input(issueRef)
  .use(async ({ ctx, input, next }) => {
    const issue = await findIssueInCommunity(
      ctx.payload,
      input.issueId,
      ctx.community.id,
    );
    if (!issue) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
    }
    return next({ ctx: { issue } });
  });

type EditorCtx = {
  db: Deps["db"];
  payload: PayloadClient;
  session: { user: { id: string } };
  community: { id: string; slug: string; isListedInDirectory: boolean };
};

function depsOf(ctx: EditorCtx): Deps {
  return { db: ctx.db, payload: ctx.payload };
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

function requireMagazine(magazine: Magazine | null): Magazine {
  if (!magazine) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  return magazine;
}

export const magazinesRouter = createTRPCRouter({
  getSettings: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx }) => ({
      magazine: ctx.magazine,
      communityIsPrivate: !isContentPublic(ctx.community),
      // What the settings form runs `planVisibilityChange` against, so it
      // asks for the opt-in exactly when the save would.
      community: {
        slug: ctx.community.slug,
        isListedInDirectory: ctx.community.isListedInDirectory,
      },
    })),

  saveSettings: editorProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }) => {
      return saveMagazineSettings(
        depsOf(ctx),
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
    .query(async ({ ctx }) =>
      ctx.magazine ? listMagazineIssues(ctx.payload, ctx.magazine.id) : [],
    ),

  createIssue: editorProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().trim().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issue = await createIssue(
        depsOf(ctx),
        requireMagazine(ctx.magazine),
        { title: input.title },
        actorOf(ctx),
      );
      return { id: issue.id };
    }),

  getIssueForEditing: issueProcedure.query(async ({ ctx }) => {
    const magazine = requireMagazine(ctx.magazine);
    const view = await loadIssueEditorView(
      depsOf(ctx),
      ctx.issue,
      actorOf(ctx),
    );
    return {
      ...view,
      magazine: { name: magazine.name, slug: magazine.slug },
      communityIsPrivate: !isContentPublic(ctx.community),
      // What the builder runs `planVisibilityChange` against, so it asks
      // for the opt-in exactly when the save would. The name heads the
      // builder's preview.
      community: {
        name: ctx.community.name,
        slug: ctx.community.slug,
        isListedInDirectory: ctx.community.isListedInDirectory,
      },
    };
  }),

  updateIssue: issueProcedure
    .input(issueDetailsInput)
    .mutation(async ({ ctx, input }) => {
      const patch: IssueDetailsPatch = {
        title: input.title,
        slug: input.issueSlug,
        coverImageUrl: input.coverImageUrl,
        editorNote: input.editorNote,
        visibility: input.visibility,
        confirmUnlistedPublic: input.confirmUnlistedPublic,
      };
      return updateIssueDetails(
        depsOf(ctx),
        ctx.issue,
        patch,
        input.expectedUpdatedAt,
        actorOf(ctx),
      );
    }),

  setIssueItems: issueProcedure
    .input(
      issueWrite.extend({
        items: z.array(issueItemInputSchema).max(MAX_ISSUE_ITEMS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return setIssueItems(
        depsOf(ctx),
        ctx.issue,
        input.items,
        input.expectedUpdatedAt,
        actorOf(ctx),
      );
    }),

  publishIssue: issueProcedure
    .input(issueWrite)
    .mutation(async ({ ctx, input }) =>
      publishIssue(
        depsOf(ctx),
        ctx.issue,
        input.expectedUpdatedAt,
        actorOf(ctx),
      ),
    ),

  deleteDraftIssue: issueProcedure.mutation(async ({ ctx }) => {
    await deleteDraftIssue(depsOf(ctx), ctx.issue, actorOf(ctx));
    return { ok: true as const };
  }),

  pickerCandidates: editorProcedure
    .input(
      z.object({
        slug: z.string(),
        kind: z.enum(PICKABLE_ITEM_KINDS),
        query: z.string().trim().max(100).default(""),
        exclude: z
          .array(z.string().max(512))
          .max(PICKER_EXCLUDE_LIMIT)
          .default([]),
      }),
    )
    .query(async ({ ctx, input }) =>
      ctx.magazine
        ? searchPickerCandidates(
            input.kind,
            input.query,
            {
              deps: depsOf(ctx),
              magazineId: ctx.magazine.id,
              community: communityOf(ctx),
              viewerId: ctx.session.user.id,
              locale: routing.defaultLocale,
            },
            input.exclude,
          )
        : [],
    ),

  // Serves the editor desk's ready list; the issue builder uses pickerCandidates.
  availableArticles: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) =>
      ctx.magazine
        ? listAvailableArticles(
            ctx.payload,
            ctx.magazine.id,
            ctx.session.user.id,
          )
        : [],
    ),

  myDraftArticles: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) =>
      ctx.magazine
        ? listDraftArticles(ctx.payload, ctx.magazine.id, ctx.session.user.id)
        : [],
    ),
});
