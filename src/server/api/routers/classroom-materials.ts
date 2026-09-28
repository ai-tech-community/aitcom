import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  communityProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_TITLE_MAX,
  MATERIAL_VISIBILITIES,
} from "@/lib/classroom/material-rules";
import {
  deleteMaterial,
  discardUpload,
  fileLink,
  finishFileUpload,
  listCourseMaterials,
  startFileUpload,
  updateMaterial,
  type HostedFileDeps,
} from "@/server/classroom/hosted-files";
import { allowanceFor, usageFor } from "@/server/classroom/media-allowance";
import type { db } from "@/server/db";
import { getObjectStorage } from "@/server/media/object-storage";
import { getPayloadClient } from "@/server/payload";

async function depsFor(database: typeof db): Promise<HostedFileDeps> {
  // Storage is handed over lazily: listing and access checks never need S3.
  return {
    payload: await getPayloadClient(),
    db: database,
    storage: getObjectStorage,
  };
}

const materialId = z.number().int().positive();

/** Classroom hosted files (spec 2026-09-27 §4). Rules live in hosted-files.ts. */
export const classroomMaterialsRouter = createTRPCRouter({
  startFileUpload: protectedProcedure
    .input(
      z.object({
        courseId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(MATERIAL_FILE_NAME_MAX),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      startFileUpload(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        ...input,
      }),
    ),

  finishFileUpload: protectedProcedure
    .input(z.object({ materialId }))
    .mutation(async ({ ctx, input }) =>
      finishFileUpload(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        materialId: input.materialId,
      }),
    ),

  /** The browser transfer was cancelled or failed: give the space back. */
  discardUpload: protectedProcedure
    .input(z.object({ materialId }))
    .mutation(async ({ ctx, input }) =>
      discardUpload(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        materialId: input.materialId,
      }),
    ),

  fileLink: publicProcedure
    .input(
      z.object({
        materialId,
        disposition: z.enum(["inline", "attachment"]).default("attachment"),
      }),
    )
    .query(async ({ ctx, input }) =>
      fileLink(await depsFor(ctx.db), {
        viewerId: ctx.session?.user?.id ?? null,
        materialId: input.materialId,
        disposition: input.disposition,
      }),
    ),

  listCourseMaterials: protectedProcedure
    .input(z.object({ courseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) =>
      listCourseMaterials(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        courseId: input.courseId,
      }),
    ),

  updateMaterial: protectedProcedure
    .input(
      z.object({
        materialId,
        title: z.string().trim().min(1).max(MATERIAL_TITLE_MAX).optional(),
        visibility: z.enum(MATERIAL_VISIBILITIES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      updateMaterial(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        ...input,
      }),
    ),

  deleteMaterial: protectedProcedure
    .input(z.object({ materialId }))
    .mutation(async ({ ctx, input }) =>
      deleteMaterial(await depsFor(ctx.db), {
        userId: ctx.session.user.id,
        materialId: input.materialId,
      }),
    ),

  /** Storage used vs allowed, for the classroom settings bar (owner/admin). */
  usage: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [usage, allowance] = await Promise.all([
        usageFor(await getPayloadClient(), ctx.community.id),
        allowanceFor(ctx.community.id),
      ]);
      return {
        fileBytesStored: usage.fileBytesStored,
        fileBytesAllowed: allowance.fileBytesStored,
      };
    }),
});
