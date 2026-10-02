import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getBadgeRarity, type BadgeRarityReport } from "@/server/badges/rarity";

export const badgesRouter = createTRPCRouter({
  /**
   * How rare each catalog badge is: holders among members with a profile,
   * or the absolute count for limited editions. Aggregates only; cached for
   * an hour.
   */
  rarity: publicProcedure.query(
    async ({ ctx }): Promise<BadgeRarityReport> => getBadgeRarity(ctx.db),
  ),
});
