import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { collectSignals } from "@/server/challenge-engine/signals";

export const challengeEngineRouter = createTRPCRouter({
  getSignals: protectedProcedure
    .input(
      z.object({ dayWindow: z.number().min(1).max(90).default(14) }).optional(),
    )
    .query(async ({ input }) => {
      const signals = await collectSignals(input?.dayWindow ?? 14);
      return { signals, count: signals.length };
    }),
});
