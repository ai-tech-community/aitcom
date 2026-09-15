import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  STARTUPS_BATCH_MAX,
  STARTUPS_CATEGORY_ERROR,
  STARTUPS_DUPLICATE_ERROR,
  STARTUPS_HOMEPAGE_ERROR,
  STARTUPS_NAME_MAX,
  STARTUPS_SOURCES_ERROR,
  normalizeStartupHomepage,
  parseStartupCategory,
  sanitizeStartupSources,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  requireHubOperator,
} from "@/server/api/trpc";
import { startups } from "@/server/db/schema";
import {
  findStartupByHomepage,
  findStartupById,
  listApprovedPublicStartups,
} from "@/server/startups/queries";

const optionalBlank = z
  .string()
  .trim()
  .max(240)
  .nullable()
  .optional()
  .transform((value) => {
    if (value == null) return null;
    return value.length > 0 ? value : null;
  });

const createStartupInput = z.object({
  name: z.string().trim().min(1).max(STARTUPS_NAME_MAX),
  homepage: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(32),
  sources: z.array(z.string().trim()).min(1).max(3),
  region: optionalBlank,
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  stage: optionalBlank,
  logoUrl: optionalBlank,
});

type CreateStartupInput = z.infer<typeof createStartupInput>;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parsedWriteFields(input: CreateStartupInput) {
  const homepage = normalizeStartupHomepage(input.homepage);
  if (!homepage) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: STARTUPS_HOMEPAGE_ERROR,
    });
  }
  const category = parseStartupCategory(input.category);
  if (!category) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: STARTUPS_CATEGORY_ERROR,
    });
  }
  const sources = sanitizeStartupSources(input.sources);
  if (sources.length < 1 || sources.length > 3) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: STARTUPS_SOURCES_ERROR,
    });
  }
  const logoUrl = input.logoUrl
    ? normalizeStartupHomepage(input.logoUrl)
    : null;
  const lat = input.lat ?? null;
  const lng = input.lng ?? null;
  const hasPin = lat != null && lng != null;

  return {
    name: input.name,
    homepage,
    category,
    sources,
    region: input.region ?? null,
    lat: hasPin ? lat : null,
    lng: hasPin ? lng : null,
    stage: input.stage ?? null,
    logoUrl,
  };
}

export const startupsRouter = createTRPCRouter({
  /** Approved cards only. Empty Neon → empty list. Never a UI seed fallback. */
  listApproved: publicProcedure.query(
    async (): Promise<StartupPublicCard[]> => {
      return listApprovedPublicStartups();
    },
  ),

  createStartup: protectedProcedure
    .input(createStartupInput)
    .mutation(async ({ ctx, input }) => {
      await requireHubOperator(ctx);
      const fields = parsedWriteFields(input);

      const existing = await findStartupByHomepage(fields.homepage);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: STARTUPS_DUPLICATE_ERROR,
        });
      }

      const [created] = await ctx.db
        .insert(startups)
        .values({
          ...fields,
          status: "approved",
          source: "staff",
          listedOn: todayIsoDate(),
          submittedByUserId: ctx.session.user.id,
        })
        .returning({ id: startups.id });

      return { id: created!.id, status: "approved" as const };
    }),

  createStartups: protectedProcedure
    .input(
      z.object({
        rows: z.array(createStartupInput).min(1).max(STARTUPS_BATCH_MAX),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireHubOperator(ctx);

      const created: string[] = [];
      const skipped: Array<{ homepage: string; reason: string }> = [];

      for (const row of input.rows) {
        let fields: ReturnType<typeof parsedWriteFields>;
        try {
          fields = parsedWriteFields(row);
        } catch (error) {
          skipped.push({
            homepage: row.homepage,
            reason:
              error instanceof TRPCError
                ? error.message
                : STARTUPS_HOMEPAGE_ERROR,
          });
          continue;
        }

        const existing = await findStartupByHomepage(fields.homepage);
        if (existing) {
          skipped.push({
            homepage: fields.homepage,
            reason: STARTUPS_DUPLICATE_ERROR,
          });
          continue;
        }

        const [inserted] = await ctx.db
          .insert(startups)
          .values({
            ...fields,
            status: "approved",
            source: "staff",
            listedOn: todayIsoDate(),
            submittedByUserId: ctx.session.user.id,
          })
          .returning({ id: startups.id });
        created.push(inserted!.id);
      }

      return { created: created.length, ids: created, skipped };
    }),

  updateStartup: protectedProcedure
    .input(
      createStartupInput.extend({
        id: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireHubOperator(ctx);
      const existing = await findStartupById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const fields = parsedWriteFields(input);
      if (fields.homepage !== existing.homepage) {
        const clash = await findStartupByHomepage(fields.homepage);
        if (clash && clash.id !== existing.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: STARTUPS_DUPLICATE_ERROR,
          });
        }
      }

      await ctx.db
        .update(startups)
        .set({
          ...fields,
          updatedAt: new Date(),
        })
        .where(eq(startups.id, input.id));

      return { id: input.id, status: existing.status };
    }),
});
