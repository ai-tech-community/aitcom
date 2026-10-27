import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import {
  autoDraftSettingsInput,
  type AutoDraftSettings,
} from "@/lib/magazines/auto-draft";
import { nextDraftAt } from "@/lib/magazines/auto-draft-schedule";
import { REVIEW_DECISIONS, REVIEW_NOTE_MAX } from "@/lib/magazines/review";
import { MAGAZINE_ROLES, type MagazineCapability } from "@/lib/magazines/roles";
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
  listPendingArticles,
  reviewMagazineArticle,
} from "@/server/magazines/article-review";
import {
  loadMagazineEditorship,
  requireCapability,
  standingCan,
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
  scheduleIssue,
  setIssueItems,
  unscheduleIssue,
  updateIssueDetails,
} from "@/server/magazines/issue-service";
import { issueItemInputSchema } from "@/server/magazines/items/registry";
import { pickerCandidatesFor } from "@/server/magazines/items/pickers";
import { suggestContextFor } from "@/server/magazines/items/context";
import { makeAutoDraft } from "@/server/magazines/auto-draft/drafter";
import { listIssueHistory } from "@/server/magazines/issue-history";
import { suggestWindowFor } from "@/server/magazines/auto-draft/window";
import {
  listAvailableArticles,
  listDraftArticles,
  listWriterArticles,
} from "@/server/magazines/magazine-articles";
import {
  getMagazineForCommunity,
  magazineTopicsOf,
  normalizeTopics,
  type MagazineCommunity,
  saveMagazineSettings,
} from "@/server/magazines/magazine-service";
import {
  assignMagazineRole,
  listMagazineStaff,
  removeMagazineRole,
  searchStaffCandidates,
} from "@/server/magazines/staff-service";
import { getPayloadClient } from "@/server/payload";
import { countSubscribers } from "@/server/magazines/subscriptions/service";
import {
  readAutoDraftSettings,
  saveAutoDraftSettings,
  type StoredAutoDraftSettings,
} from "@/server/magazines/auto-draft/settings";

/**
 * The magazine editor API (ADR-0042/0043). Every procedure is a community
 * procedure (input `slug` is the COMMUNITY slug) gated by capability.
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
 * The editorship seam gates every procedure by capability. The community's
 * magazine (null until the first settings save), standing and Payload go on ctx.
 */
function magazineProcedure(capability: MagazineCapability) {
  return communityProcedure.use(async ({ ctx, next }) => {
    const payload = await getPayloadClient();
    const magazine = await getMagazineForCommunity(payload, ctx.community.id);
    const standing = await loadMagazineEditorship(
      ctx.db,
      { communityId: ctx.community.id, magazineId: magazine?.id ?? null },
      ctx.session.user.id,
    );
    requireCapability(standing, capability);
    return next({ ctx: { payload, magazine, standing } });
  });
}

const writerProcedure = magazineProcedure("write");
const editorProcedure = magazineProcedure("edit");
const managerProcedure = magazineProcedure("manage");

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

function autoDraftSettingsOf({
  scheduleStartsAt: _scheduleStartsAt,
  updatedBy: _updatedBy,
  ...settings
}: StoredAutoDraftSettings): AutoDraftSettings {
  return settings;
}

const staffUserInput = z.object({
  slug: z.string(),
  userId: z.string().min(1).max(255),
});

export const magazinesRouter = createTRPCRouter({
  makeAutoDraftNow: editorProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(({ ctx }) =>
      makeAutoDraft(depsOf(ctx), {
        magazine: requireMagazine(ctx.magazine),
        community: { ...communityOf(ctx), name: ctx.community.name },
        periodKey: `manual:${crypto.randomUUID()}`,
        trigger: "manual",
        actingUserId: ctx.session.user.id,
        requestedBy: ctx.session.user.id,
        now: new Date(),
      }),
    ),

  autoDraftHistory: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx }) =>
      ctx.magazine ? listIssueHistory(ctx.db, ctx.magazine.id) : [],
    ),

  autoDraftSettings: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      if (!ctx.magazine) return null;
      const stored = await readAutoDraftSettings(ctx.db, ctx.magazine.id);
      return {
        settings: autoDraftSettingsOf(stored),
        nextDraftAt:
          nextDraftAt(
            stored,
            new Date(),
            stored.scheduleStartsAt,
          )?.toISOString() ?? null,
        canManage: standingCan(ctx.standing, "manage"),
        magazineDefaultVisibility: ctx.magazine.defaultVisibility,
        hasTopics: normalizeTopics(magazineTopicsOf(ctx.magazine)).length > 0,
        communityIsPrivate: !isContentPublic(ctx.community),
        community: {
          slug: ctx.community.slug,
          isListedInDirectory: ctx.community.isListedInDirectory,
        },
      };
    }),

  saveAutoDraftSettings: managerProcedure
    .input(autoDraftSettingsInput.extend({ slug: z.string() }))
    .mutation(async ({ ctx, input }) =>
      autoDraftSettingsOf(
        await saveAutoDraftSettings(
          depsOf(ctx),
          requireMagazine(ctx.magazine),
          input,
          { ...actorOf(ctx), leadsCommunity: ctx.standing.leadsCommunity },
        ),
      ),
    ),

  subscriberCounts: writerProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx }) =>
      ctx.magazine ? countSubscribers(ctx.db, ctx.magazine.id) : null,
    ),
  getSettings: managerProcedure
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

  saveSettings: managerProcedure
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
        ctx.standing.leadsCommunity,
      );
    }),

  listStaff: managerProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx }) =>
      listMagazineStaff(
        ctx.db,
        requireMagazine(ctx.magazine),
        ctx.session.user.id,
      ),
    ),

  searchStaffCandidates: managerProcedure
    .input(z.object({ slug: z.string(), query: z.string().trim().max(100) }))
    .query(({ ctx, input }) =>
      searchStaffCandidates(ctx.db, requireMagazine(ctx.magazine), input.query),
    ),

  assignStaffRole: managerProcedure
    .input(staffUserInput.extend({ role: z.enum(MAGAZINE_ROLES) }))
    .mutation(({ ctx, input }) =>
      assignMagazineRole(
        ctx.db,
        requireMagazine(ctx.magazine),
        input,
        actorOf(ctx),
      ),
    ),

  removeStaffRole: managerProcedure
    .input(staffUserInput)
    .mutation(async ({ ctx, input }) => {
      await removeMagazineRole(
        ctx.db,
        requireMagazine(ctx.magazine),
        input.userId,
      );
      return { ok: true as const };
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
        ctx.standing.leadsCommunity,
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

  scheduleIssue: issueProcedure
    .input(
      issueWrite.extend({ publishAt: z.string().datetime({ offset: true }) }),
    )
    .mutation(async ({ ctx, input }) =>
      scheduleIssue(
        depsOf(ctx),
        ctx.issue,
        new Date(input.publishAt),
        input.expectedUpdatedAt,
        actorOf(ctx),
      ),
    ),

  unscheduleIssue: issueProcedure
    .input(issueWrite)
    .mutation(async ({ ctx, input }) =>
      unscheduleIssue(
        depsOf(ctx),
        ctx.issue,
        input.expectedUpdatedAt,
        actorOf(ctx),
      ),
    ),

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
    .query(async ({ ctx, input }) => {
      const magazine = ctx.magazine;
      if (!magazine) return [];
      const deps = depsOf(ctx);
      return pickerCandidatesFor(
        input.kind,
        input.query,
        {
          deps,
          magazineId: magazine.id,
          community: communityOf(ctx),
          viewerId: ctx.session.user.id,
          locale: routing.defaultLocale,
        },
        input.exclude,
        async () => {
          const now = new Date();
          return {
            ctx: suggestContextFor(deps, {
              magazine,
              community: { ...communityOf(ctx), name: ctx.community.name },
              viewerId: ctx.session.user.id,
              locale: routing.defaultLocale,
              now,
            }),
            window: await suggestWindowFor(
              deps,
              magazine.id,
              (await readAutoDraftSettings(ctx.db, magazine.id)).lookBack,
              now,
            ),
          };
        },
      );
    }),

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

  reviewQueue: editorProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx }) =>
      ctx.magazine ? listPendingArticles(ctx.payload, ctx.magazine.id) : [],
    ),

  reviewArticle: editorProcedure
    .input(
      z.object({
        slug: z.string(),
        articleId: z.number().int().positive(),
        decision: z.enum(REVIEW_DECISIONS),
        note: z.string().trim().max(REVIEW_NOTE_MAX).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      reviewMagazineArticle(
        depsOf(ctx),
        requireMagazine(ctx.magazine),
        input,
        actorOf(ctx),
      ),
    ),

  myMagazineArticles: writerProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx }) =>
      ctx.magazine
        ? listWriterArticles(ctx.payload, ctx.magazine.id, ctx.session.user.id)
        : [],
    ),

  myDraftArticles: writerProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) =>
      ctx.magazine
        ? listDraftArticles(ctx.payload, ctx.magazine.id, ctx.session.user.id)
        : [],
    ),
});
