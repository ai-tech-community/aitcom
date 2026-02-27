import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { collectSignals } from "@/server/challenge-engine/signals";
import { runChallengeEngine } from "@/server/challenge-engine";

export const challengeEngineRouter = createTRPCRouter({
  // Get current community signals (preview)
  getSignals: protectedProcedure
    .input(
      z
        .object({ dayWindow: z.number().min(1).max(90).default(14) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const adminIds = process.env.CHALLENGE_ENGINE_ADMIN_IDS?.split(",") ?? [];
      if (!adminIds.includes(ctx.session.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const signals = await collectSignals(input?.dayWindow ?? 14);
      return { signals, count: signals.length };
    }),

  // Generate a challenge from signals
  generate: protectedProcedure
    .input(
      z
        .object({
          autoPublish: z.boolean().default(false),
          dayWindow: z.number().min(1).max(90).default(14),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const adminIds = process.env.CHALLENGE_ENGINE_ADMIN_IDS?.split(",") ?? [];
      if (!adminIds.includes(ctx.session.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const result = await runChallengeEngine({
        autoPublish: input?.autoPublish ?? false,
        dayWindow: input?.dayWindow ?? 14,
      });

      if (result.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error,
        });
      }

      return result;
    }),
});
