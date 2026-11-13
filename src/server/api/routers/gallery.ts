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
import { VIDEO_VISIBILITIES } from "@/lib/video-rules";
import type { db } from "@/server/db";
import { loadGalleryViewer } from "@/server/gallery/access";
import type { GalleryDeps } from "@/server/gallery/deps";
import { galleryError } from "@/server/gallery/errors";
import { galleryEnabled } from "@/server/gallery/flag";
import {
  deleteItem,
  getItem,
  linkableEvents,
  listFacets,
  listItems,
  updateItem,
} from "@/server/gallery/items";
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
 * The rollout switch, checked first in every procedure: with the gallery off
 * nothing is validated, loaded or written, and every caller gets the same
 * GALLERY_DISABLED answer.
 */
function requireGalleryEnabled<T>({ next }: { next: () => T }): T {
  if (!galleryEnabled()) throw galleryError("GALLERY_DISABLED");
  return next();
}

const galleryPublicProcedure = publicProcedure.use(requireGalleryEnabled);
const galleryProtectedProcedure = protectedProcedure.use(requireGalleryEnabled);

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
  /** A page of the wall. Signed-out visitors see what outsiders may see. */
  list: galleryPublicProcedure
    .input(
      inCommunity.extend({
        eventId: z.union([recordId, z.literal("none")]).optional(),
        topicSlug: topicSlug.optional(),
        mediaType: z.enum(GALLERY_MEDIA_TYPES).optional(),
        cursor: recordId.optional(),
        limit: z.number().int().min(1).max(GALLERY_PAGE_SIZE).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const deps = await depsFor(ctx.db);
      const { slug, ...filters } = input;
      const viewer = await loadGalleryViewer(deps, {
        slug,
        userId: ctx.session?.user?.id ?? null,
      });
      return listItems(deps, { viewer, ...filters });
    }),

  /** The wall's filter choices, from the items this viewer may see. */
  facets: galleryPublicProcedure
    .input(inCommunity)
    .query(async ({ ctx, input }) => {
      const deps = await depsFor(ctx.db);
      const viewer = await loadGalleryViewer(deps, {
        slug: input.slug,
        userId: ctx.session?.user?.id ?? null,
      });
      return listFacets(deps, { viewer });
    }),

  item: galleryPublicProcedure
    .input(itemInCommunity)
    .query(async ({ ctx, input }) => {
      const deps = await depsFor(ctx.db);
      const viewer = await loadGalleryViewer(deps, {
        slug: input.slug,
        userId: ctx.session?.user?.id ?? null,
      });
      return getItem(deps, { viewer, itemId: input.itemId });
    }),

  /** Events the upload dialog offers (members only). */
  linkableEvents: galleryProtectedProcedure
    .input(inCommunity)
    .query(async ({ ctx, input }) => {
      const deps = await depsFor(ctx.db);
      const viewer = await loadGalleryViewer(deps, {
        slug: input.slug,
        userId: ctx.session.user.id,
      });
      return linkableEvents(deps, { viewer });
    }),

  startBatch: galleryProtectedProcedure
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
  startItem: galleryProtectedProcedure
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

  finishItem: galleryProtectedProcedure
    .input(z.object({ itemId: recordId }))
    .mutation(async ({ ctx, input }) =>
      finishItem(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        itemId: input.itemId,
      }),
    ),

  /** The browser transfer was cancelled or failed: give the space back. */
  discardItem: galleryProtectedProcedure
    .input(z.object({ itemId: recordId }))
    .mutation(async ({ ctx, input }) =>
      discardItem(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        itemId: input.itemId,
      }),
    ),

  /** Slice 1 passes no feed announcement; slice 2 adds it here. */
  finishBatch: galleryProtectedProcedure
    .input(z.object({ batchId: recordId }))
    .mutation(async ({ ctx, input }) =>
      finishBatch(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        batchId: input.batchId,
      }),
    ),

  /** Null clears a field; a missing field is left as it is. */
  updateItem: galleryProtectedProcedure
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
      const deps = await depsFor(ctx.db);
      const { slug, ...changes } = input;
      const viewer = await loadGalleryViewer(deps, {
        slug,
        userId: ctx.session.user.id,
      });
      return updateItem(deps, { viewer, ...changes });
    }),

  /**
   * No membership gate here on purpose: an uploader may always delete their
   * own item, even after leaving the community (the service decides).
   */
  deleteItem: galleryProtectedProcedure
    .input(itemInCommunity)
    .mutation(async ({ ctx, input }) => {
      const deps = await depsFor(ctx.db);
      const viewer = await loadGalleryViewer(deps, {
        slug: input.slug,
        userId: ctx.session.user.id,
      });
      return deleteItem(deps, { viewer, itemId: input.itemId });
    }),
});
