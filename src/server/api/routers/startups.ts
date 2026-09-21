import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  STARTUPS_BATCH_MAX,
  STARTUPS_CATEGORY_ERROR,
  STARTUPS_DUPLICATE_ERROR,
  STARTUPS_EXIT_ERROR,
  STARTUPS_HOMEPAGE_ERROR,
  STARTUPS_JOBS_URL_ERROR,
  STARTUPS_DESCRIPTION_MAX,
  STARTUPS_NAME_MAX,
  STARTUPS_SLUG_ERROR,
  STARTUPS_SOURCES_ERROR,
  allocateStartupSlug,
  isReservedStartupSlug,
  sanitizeStartupDescription,
  normalizeStartupHomepage,
  parseStartupCategory,
  parseStartupExitOn,
  parseStartupExitStatus,
  parseStartupSlug,
  pulseExitAlias,
  resolveStartupPinCoords,
  sanitizeStartupFounders,
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
  findStartupBySlug,
  listApprovedPublicStartups,
} from "@/server/startups/queries";
import {
  deleteStartupCvForUser,
  findStartupCvForUser,
  upsertStartupCvForUser,
} from "@/server/startups/cv";
import {
  extractStartupCvText,
  parseStartupCvFileName,
  STARTUP_CV_FILENAME_MAX,
  STARTUP_CV_MAX_BYTES,
  STARTUP_CV_READ_ERROR,
} from "@/lib/investigations/startup-cv";

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

const optionalDescription = z
  .string()
  .trim()
  .max(STARTUPS_DESCRIPTION_MAX)
  .nullable()
  .optional()
  .transform((value) => sanitizeStartupDescription(value));

function flattenPulseStartupRow(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const row = raw as Record<string, unknown>;
  const exitYear = row.exitOn ?? row.exit_year;
  const exitOn =
    typeof exitYear === "string" || typeof exitYear === "number"
      ? String(exitYear)
      : null;
  return {
    ...row,
    logoUrl: row.logoUrl ?? row.logo_url ?? null,
    jobsUrl: row.jobsUrl ?? row.jobs_url ?? null,
    description: row.description ?? row.blurb ?? null,
    slug: row.slug ?? null,
    exitStatus:
      row.exitStatus ??
      pulseExitAlias(typeof row.status === "string" ? row.status : null),
    acquirer: row.acquirer ?? row.exit_acquirer ?? null,
    exitOn,
    founders: Array.isArray(row.founders)
      ? row.founders.flatMap((founder) => {
          if (!founder || typeof founder !== "object") return [];
          const item = founder as Record<string, unknown>;
          return [
            {
              ...item,
              imageUrl:
                item.imageUrl ?? item.image_url ?? item.photo_url ?? null,
            },
          ];
        })
      : [],
  };
}

const createStartupFields = z.object({
  name: z.string().trim().min(1).max(STARTUPS_NAME_MAX),
  homepage: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(32),
  sources: z.array(z.string().trim()).min(1).max(3),
  region: optionalBlank,
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  stage: optionalBlank,
  logoUrl: optionalBlank,
  description: optionalDescription,
  blurb: optionalDescription,
  founders: z
    .array(
      z.object({
        name: z.string().trim().max(160),
        url: optionalBlank,
        imageUrl: optionalBlank,
        image_url: optionalBlank,
        photo_url: optionalBlank,
      }),
    )
    .max(8)
    .optional(),
  exitStatus: optionalBlank,
  acquirer: optionalBlank,
  exitOn: optionalBlank,
  jobsUrl: optionalBlank,
  slug: optionalBlank,
});

const createStartupInput = z.preprocess(
  flattenPulseStartupRow,
  createStartupFields,
);

const updateStartupInput = z.preprocess(
  flattenPulseStartupRow,
  createStartupFields.extend({
    id: z.string().trim().min(1),
  }),
);

type CreateStartupInput = z.infer<typeof createStartupFields>;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function resolveWriteSlug(
  name: string,
  requested: string | null | undefined,
  existingSlug?: string | null,
  excludeId?: string,
): Promise<string> {
  const parsed = parseStartupSlug(requested);
  if (parsed) {
    if (isReservedStartupSlug(parsed)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: STARTUPS_SLUG_ERROR,
      });
    }
    const clash = await findStartupBySlug(parsed);
    if (clash && clash.id !== excludeId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: STARTUPS_SLUG_ERROR,
      });
    }
    return parsed;
  }
  const keep = parseStartupSlug(existingSlug);
  if (keep) return keep;
  const taken = new Set<string>();
  let candidate = allocateStartupSlug(name, taken);
  for (let i = 0; i < 40; i++) {
    const found = await findStartupBySlug(candidate);
    if (!found || found.id === excludeId) return candidate;
    taken.add(candidate);
    candidate = allocateStartupSlug(name, taken);
  }
  throw new TRPCError({
    code: "CONFLICT",
    message: STARTUPS_SLUG_ERROR,
  });
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
  const region = input.region ?? null;
  const resolved = resolveStartupPinCoords({
    region,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
  });
  const founders = sanitizeStartupFounders(input.founders);
  const rawExit = input.exitStatus?.trim() ?? "";
  const exitStatus = rawExit ? parseStartupExitStatus(rawExit) : null;
  if (rawExit && !exitStatus) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: STARTUPS_EXIT_ERROR,
    });
  }
  const jobsRaw = input.jobsUrl?.trim() ?? "";
  const jobsUrl = jobsRaw ? normalizeStartupHomepage(jobsRaw) : null;
  if (jobsRaw && !jobsUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: STARTUPS_JOBS_URL_ERROR,
    });
  }

  return {
    name: input.name,
    homepage,
    category,
    sources,
    region,
    lat: resolved?.lat ?? null,
    lng: resolved?.lng ?? null,
    stage: input.stage ?? null,
    logoUrl,
    description: sanitizeStartupDescription(
      input.description ?? input.blurb ?? null,
    ),
    founders,
    exitStatus,
    acquirer: exitStatus ? (input.acquirer ?? null) : null,
    exitOn: exitStatus ? parseStartupExitOn(input.exitOn) : null,
    jobsUrl,
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
      const slug = await resolveWriteSlug(fields.name, input.slug);

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
          slug,
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

        let slug: string;
        try {
          slug = await resolveWriteSlug(fields.name, row.slug);
        } catch (error) {
          skipped.push({
            homepage: fields.homepage,
            reason:
              error instanceof TRPCError ? error.message : STARTUPS_SLUG_ERROR,
          });
          continue;
        }

        const [inserted] = await ctx.db
          .insert(startups)
          .values({
            ...fields,
            slug,
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
    .input(updateStartupInput)
    .mutation(async ({ ctx, input }) => {
      await requireHubOperator(ctx);
      const existing = await findStartupById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const fields = parsedWriteFields(input);
      const slug = await resolveWriteSlug(
        fields.name,
        input.slug,
        existing.slug,
        existing.id,
      );
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
          slug,
          updatedAt: new Date(),
        })
        .where(eq(startups.id, input.id));

      return { id: input.id, status: existing.status };
    }),

  getMyCv: protectedProcedure.query(async ({ ctx }) => {
    return findStartupCvForUser(ctx.session.user.id);
  }),

  upsertMyCv: protectedProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(STARTUP_CV_FILENAME_MAX),
        mimeType: z.string().trim().min(1).max(128),
        bytesBase64: z
          .string()
          .min(1)
          .max(Math.ceil(STARTUP_CV_MAX_BYTES * 1.4)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const fileName = parseStartupCvFileName(input.fileName);
      if (!fileName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: STARTUP_CV_READ_ERROR,
        });
      }
      let buffer: Buffer;
      try {
        buffer = Buffer.from(input.bytesBase64, "base64");
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: STARTUP_CV_READ_ERROR,
        });
      }
      if (buffer.length === 0 || buffer.length > STARTUP_CV_MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: STARTUP_CV_READ_ERROR,
        });
      }
      const text = extractStartupCvText(buffer, fileName, input.mimeType);
      if (!text) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: STARTUP_CV_READ_ERROR,
        });
      }
      return upsertStartupCvForUser({
        userId: ctx.session.user.id,
        fileName,
        mimeType: input.mimeType,
        textContent: text,
      });
    }),

  deleteMyCv: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteStartupCvForUser(ctx.session.user.id);
    return { deleted: true };
  }),
});
