import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  GALLERY_ALT_MAX,
  GALLERY_BATCH_TEXT_MAX,
  GALLERY_CAPTION_MAX,
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
  GALLERY_MEDIA_TYPES,
  GALLERY_PAGE_SIZE,
} from "@/lib/gallery-rules";
import {
  GALLERY_REPORT_NOTE_MAX,
  GALLERY_REPORT_REASONS,
  GALLERY_REVIEW_REPORTS_MAX,
} from "@/lib/gallery-report-reasons";
import { VIDEO_VISIBILITIES } from "@/lib/video-rules";
import type { db } from "@/server/db";
import { loadGalleryViewer } from "@/server/gallery/access";
import { galleryAnnouncer } from "@/server/gallery/announce";
import type { GalleryDeps } from "@/server/gallery/deps";
import {
  deleteItem,
  getItem,
  listFacets,
  listItems,
  updateItem,
  uploadChoices,
} from "@/server/gallery/items";
import { galleryReportNotices } from "@/server/gallery/notifications";
import {
  listItemReports,
  reportItem,
  reviewItemReports,
} from "@/server/gallery/reports";
import {
  discardItem,
  finishBatch,
  finishItem,
  startBatch,
  startItem,
} from "@/server/gallery/uploads";
import { getObjectStorage } from "@/server/media/object-storage";
import { getPayloadClient } from "@/server/payload";

async function depsFor(database: typeof db): Promise<GalleryDeps> {
  // Storage is handed over lazily: access checks and refusals never need S3.
  return {
    payload: await getPayloadClient(),
    db: database,
    storage: getObjectStorage,
  };
}

/**
 * The gallery's services and the viewer of the community with this slug
 * (signed-out visitors are `userId: null`), for the procedures whose rules
 * depend on who is looking.
 */
async function viewerIn(
  ctx: { db: typeof db; session: { user: { id: string } } | null },
  slug: string,
) {
  const deps = await depsFor(ctx.db);
  const viewer = await loadGalleryViewer(deps, {
    slug,
    userId: ctx.session?.user.id ?? null,
  });
  return { deps, viewer };
}

/** Upper bounds for identifiers with no gallery rule of their own. */
const SLUG_MAX = 100;
const TOPIC_SLUG_MAX = 100;
const CONTENT_TYPE_MAX = 255;

// Numbers are whole and in range here, so the services' "malformed number"
// refusals are never reached through the API.
const recordId = z.number().int().positive();
const slug = z.string().min(1).max(SLUG_MAX);
const topicSlug = z.string().min(1).max(TOPIC_SLUG_MAX);
const inCommunity = z.object({ slug });
const itemInCommunity = z.object({ slug, itemId: recordId });

/**
 * Community gallery (spec 2026-11-13). A thin shell: every rule — who may
 * see, upload, edit or delete what — lives in `src/server/gallery/`.
 */
export const galleryRouter = createTRPCRouter({
  /**
   * A page of the wall, or of one upload's items (a feed post's lightbox).
   * Signed-out visitors see what outsiders may see.
   */
  list: publicProcedure
    .input(
      inCommunity.extend({
        eventId: z.union([recordId, z.literal("none")]).optional(),
        batchId: recordId.optional(),
        topicSlug: topicSlug.optional(),
        mediaType: z.enum(GALLERY_MEDIA_TYPES).optional(),
        cursor: recordId.optional(),
        limit: z.number().int().min(1).max(GALLERY_PAGE_SIZE).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { slug, ...filters } = input;
      const { deps, viewer } = await viewerIn(ctx, slug);
      return listItems(deps, { viewer, ...filters });
    }),

  /** The wall's filter choices, from the items this viewer may see. */
  facets: publicProcedure.input(inCommunity).query(async ({ ctx, input }) => {
    const { deps, viewer } = await viewerIn(ctx, input.slug);
    return listFacets(deps, { viewer });
  }),

  item: publicProcedure.input(itemInCommunity).query(async ({ ctx, input }) => {
    const { deps, viewer } = await viewerIn(ctx, input.slug);
    return getItem(deps, { viewer, itemId: input.itemId });
  }),

  /** What the upload and edit dialogs offer: events, audience (members only). */
  uploadChoices: protectedProcedure
    .input(inCommunity)
    .query(async ({ ctx, input }) => {
      const { deps, viewer } = await viewerIn(ctx, input.slug);
      return uploadChoices(deps, { viewer });
    }),

  startBatch: protectedProcedure
    .input(
      inCommunity.extend({
        eventId: recordId.optional(),
        topicSlug: topicSlug.optional(),
        visibility: z.enum(VIDEO_VISIBILITIES),
        magazineConsent: z.boolean(),
        caption: z.string().max(GALLERY_BATCH_TEXT_MAX).optional(),
        plannedFiles: z.number().int().min(1).max(GALLERY_MAX_FILES_PER_BATCH),
        plannedVideos: z
          .number()
          .int()
          .min(0)
          .max(GALLERY_MAX_VIDEOS_PER_BATCH),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      startBatch(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        ...input,
      }),
    ),

  /** One file's upload grants, asked for when that file is ready to send. */
  startItem: protectedProcedure
    .input(
      z.object({
        batchId: recordId,
        mediaType: z.enum(GALLERY_MEDIA_TYPES),
        contentType: z.string().min(1).max(CONTENT_TYPE_MAX),
        bytes: z.number().int().positive(),
        thumbnailBytes: z.number().int().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        durationSeconds: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      startItem(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        ...input,
      }),
    ),

  finishItem: protectedProcedure
    .input(z.object({ itemId: recordId }))
    .mutation(async ({ ctx, input }) =>
      finishItem(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        itemId: input.itemId,
      }),
    ),

  /** The browser transfer was cancelled or failed: give the space back. */
  discardItem: protectedProcedure
    .input(z.object({ itemId: recordId }))
    .mutation(async ({ ctx, input }) =>
      discardItem(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        itemId: input.itemId,
      }),
    ),

  /** Finishes the batch and announces it in the community feed. */
  finishBatch: protectedProcedure
    .input(z.object({ batchId: recordId }))
    .mutation(async ({ ctx, input }) => {
      const deps = await depsFor(ctx.db);
      return finishBatch(
        deps,
        { userId: ctx.session.user.id, batchId: input.batchId },
        galleryAnnouncer({ payload: deps.payload, db: deps.db }),
      );
    }),

  /** Null clears a field; a missing field is left as it is. */
  updateItem: protectedProcedure
    .input(
      itemInCommunity.extend({
        caption: z.string().max(GALLERY_CAPTION_MAX).optional(),
        alt: z.string().max(GALLERY_ALT_MAX).optional(),
        topicSlug: topicSlug.nullable().optional(),
        eventId: recordId.nullable().optional(),
        magazineConsent: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { slug, ...changes } = input;
      const { deps, viewer } = await viewerIn(ctx, slug);
      return updateItem(deps, { viewer, ...changes });
    }),

  /**
   * No membership gate here on purpose: an uploader may always delete their
   * own item, even after leaving the community (the service decides).
   */
  deleteItem: protectedProcedure
    .input(itemInCommunity)
    .mutation(async ({ ctx, input }) => {
      const { deps, viewer } = await viewerIn(ctx, input.slug);
      return deleteItem(deps, { viewer, itemId: input.itemId });
    }),

  /**
   * Anyone signed in who may read the item, members or not. The reason and
   * the note are checked here, before anything is stored: the service reads
   * any refusal from the reports collection as a duplicate report.
   */
  reportItem: protectedProcedure
    .input(
      itemInCommunity.extend({
        reason: z.enum(GALLERY_REPORT_REASONS),
        note: z.string().max(GALLERY_REPORT_NOTE_MAX).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { slug, ...report } = input;
      const { deps, viewer } = await viewerIn(ctx, slug);
      return reportItem(
        { ...deps, notify: galleryReportNotices(deps.db) },
        { viewer, ...report },
      );
    }),

  /** Why a hidden item was reported, for the community's moderators. */
  itemReports: protectedProcedure
    .input(itemInCommunity)
    .query(async ({ ctx, input }) => {
      const { deps, viewer } = await viewerIn(ctx, input.slug);
      return listItemReports(deps, { viewer, itemId: input.itemId });
    }),

  /**
   * A moderator restores a reported item or removes it. A restore names
   * the reports it was decided on (their ids from `itemReports`); any other
   * open report stays open. It may name none: an item can stay hidden
   * after its reports were deleted in the admin.
   */
  reviewItemReports: protectedProcedure
    .input(
      z.discriminatedUnion("action", [
        itemInCommunity.extend({
          action: z.literal("restore"),
          reviewedReportIds: z
            .array(recordId)
            .min(0)
            .max(GALLERY_REVIEW_REPORTS_MAX),
        }),
        itemInCommunity.extend({ action: z.literal("remove") }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const { slug, ...review } = input;
      const { deps, viewer } = await viewerIn(ctx, slug);
      return reviewItemReports(
        { ...deps, notify: galleryReportNotices(deps.db) },
        { viewer, ...review },
      );
    }),
});
