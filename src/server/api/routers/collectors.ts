import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { collectorsEnabled } from "@/server/collectors/flags";
import { liveCollectorRuns } from "@/server/collectors/live";

/**
 * The web's adapter over the CollectorRuns facade (ADR-0040). It adds only
 * the feature gate and the first-use acknowledgement; every other rule
 * (ownership, quota, validation) lives in the facade, so MCP behaves the same.
 */
function facade() {
  if (!collectorsEnabled()) {
    throw new TRPCError({ code: "NOT_FOUND", message: "COLLECTORS_OFF" });
  }
  return liveCollectorRuns();
}

/** How many recent runs the landing shows. */
const RECENT_RUNS = 5;

function runNotFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
}

async function isFirstTime(
  runs: ReturnType<typeof liveCollectorRuns>,
  userId: string,
) {
  const { runs: latest } = await runs.listRuns(userId, { limit: 1 });
  return latest.length === 0;
}

export const collectorsRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(z.object({ locale: z.enum(["en", "nl"]) }))
    .query(async ({ ctx, input }) => {
      const runs = facade();
      const userId = ctx.session.user.id;
      const [recent, usage] = await Promise.all([
        runs.listRuns(userId, { limit: RECENT_RUNS }),
        runs.usage(userId),
      ]);
      return {
        collectors: runs.listCollectors(input.locale),
        presets: runs.listPresets(input.locale),
        // Names for runs whose preset or collector is switched off.
        titles: runs.listTitles(input.locale),
        recentRuns: recent.runs,
        usage,
        needsAcknowledgement: recent.runs.length === 0,
      };
    }),

  /** Which preset a pasted address opens. Never fetches the address. */
  recognize: protectedProcedure
    .input(z.object({ address: z.string().max(4_096) }))
    .query(({ input }) => facade().recognize(input.address)),

  start: protectedProcedure
    .input(
      z.object({
        collectorId: z.string().min(1).max(64),
        input: z.unknown(),
        acknowledged: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const runs = facade();
      const userId = ctx.session.user.id;
      if (!input.acknowledged && (await isFirstTime(runs, userId))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ACKNOWLEDGEMENT_REQUIRED",
        });
      }
      return runs.startRun({
        userId,
        origin: "web",
        collectorId: input.collectorId,
        input: input.input,
      });
    }),

  run: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      return (
        (await facade().getRun(ctx.session.user.id, input.runId)) ??
        runNotFound()
      );
    }),

  runs: protectedProcedure
    .input(
      z.object({
        cursor: z.string().max(300).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(({ ctx, input }) => facade().listRuns(ctx.session.user.id, input)),

  items: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(255),
        afterSeq: z.number().int().min(-1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { runId, ...page } = input;
      return (
        (await facade().listItems(ctx.session.user.id, runId, page)) ??
        runNotFound()
      );
    }),
});
