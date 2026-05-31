import {
  createTRPCRouter,
  protectedProcedure,
  requireHubOperator,
} from "@/server/api/trpc";
import {
  BROADCAST_CEILING,
  CEILING_WINDOW_DAYS,
  DIGEST_CADENCE,
} from "@/server/notifications/constants";

export const hubOperatorRouter = createTRPCRouter({
  /** Read the Hub-invariant notification limits. Hub-operator only.
   *  Mutation/tuning UI is deferred to the dedicated Hub-operator epic (#85). */
  notificationLimits: protectedProcedure.query(async ({ ctx }) => {
    await requireHubOperator(ctx);
    return {
      broadcastCeiling: BROADCAST_CEILING,
      ceilingWindowDays: CEILING_WINDOW_DAYS,
      digestCadence: DIGEST_CADENCE,
      tunable: false, // becomes true when the Hub-operator settings epic lands
    };
  }),
});
