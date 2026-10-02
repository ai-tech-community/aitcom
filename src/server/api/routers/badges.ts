import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TrackProgress } from "@/lib/badges/progress";
import type { BadgeSlug } from "@/lib/badges/catalog";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  loadUnseenEarnings,
  markEarningsSeen,
  UNSEEN_READ_CAP,
  type UnseenEarnings,
} from "@/server/badges/earning-moment";
import { loadTrackProgress } from "@/server/badges/progress";
import {
  getBadgeRarity,
  optionalBadgeRarity,
  type BadgeRarityReport,
} from "@/server/badges/rarity";
import {
  pinShowcaseBadge,
  unpinShowcaseBadge,
  type ShowcaseWrite,
} from "@/server/badges/showcase";

const slugInput = z.object({ slug: z.string().min(1).max(100) });

/** Maps a refused showcase write to the error the owner's UI shows. */
function showcasePins(write: ShowcaseWrite): { pins: BadgeSlug[] } {
  if (write.ok) return { pins: write.pins };
  switch (write.reason) {
    case "no_profile":
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Set up your profile first.",
      });
    case "not_held":
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You can only pin a badge you have earned.",
      });
    case "full":
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Your showcase is full. Unpin a badge first.",
      });
  }
}

export const badgesRouter = createTRPCRouter({
  /**
   * How rare each catalog badge is: holders among members with a profile,
   * or the absolute count for limited editions. Aggregates only; cached for
   * an hour.
   */
  rarity: publicProcedure.query(
    async ({ ctx }): Promise<BadgeRarityReport> => getBadgeRarity(ctx.db),
  ),

  /**
   * The caller's own progress on every track: the engine's metric now and
   * the next tier's threshold. Only ever the caller's; visitors never see
   * locked badges or progress.
   */
  myProgress: protectedProcedure.query(
    async ({ ctx }): Promise<TrackProgress[]> =>
      loadTrackProgress(ctx.db, ctx.session.user.id),
  ),

  /** Pins a badge the caller holds to their profile showcase (max three). */
  pin: protectedProcedure
    .input(slugInput)
    .mutation(async ({ ctx, input }) =>
      showcasePins(
        await pinShowcaseBadge(ctx.db, ctx.session.user.id, input.slug),
      ),
    ),

  /**
   * The caller's unseen badges and awards for the earning moment: the
   * oldest few to celebrate, the ids of the rest ("+N more"), and their
   * showcase pins. Only ever the caller's own rows.
   */
  unseen: protectedProcedure.query(
    async ({ ctx }): Promise<UnseenEarnings> =>
      loadUnseenEarnings(
        ctx.db,
        ctx.session.user.id,
        await optionalBadgeRarity(ctx.db),
      ),
  ),

  /**
   * Marks earnings seen after the celebration was shown and dismissed or
   * acted on. Ids of other members' rows are ignored.
   */
  markSeen: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string().min(1).max(255)).min(1).max(UNSEEN_READ_CAP),
      }),
    )
    .mutation(async ({ ctx, input }) => ({
      marked: await markEarningsSeen(ctx.db, ctx.session.user.id, input.ids),
    })),

  /** Removes a badge (or any tier of its track) from the caller's showcase. */
  unpin: protectedProcedure
    .input(slugInput)
    .mutation(async ({ ctx, input }) =>
      showcasePins(
        await unpinShowcaseBadge(ctx.db, ctx.session.user.id, input.slug),
      ),
    ),
});
