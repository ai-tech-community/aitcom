import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { hubMailPrefs, notificationOptouts } from "@/server/db/schema";
import {
  DIGEST_SECTIONS,
  OPTOUT_CATEGORIES,
  optoutInputError,
  resolvePrefs,
  type OptoutRow,
} from "@/server/notifications/prefs";
import {
  DEFAULT_HUB_MAIL_PREFS,
  HUB_MAIL_CASES,
  resolveHubMailPrefs,
} from "@/server/notifications/hub-mail-prefs";

const hubMailCaseSchema = z.enum(HUB_MAIL_CASES);

export const notificationPrefsRouter = createTRPCRouter({
  /** All opt-out rows for the current user, plus the resolved view. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        communityId: notificationOptouts.communityId,
        category: notificationOptouts.category,
      })
      .from(notificationOptouts)
      .where(eq(notificationOptouts.userId, ctx.session.user.id));

    const [hubRow] = await ctx.db
      .select({
        dm: hubMailPrefs.dm,
        mention: hubMailPrefs.mention,
        forumReply: hubMailPrefs.forumReply,
        digest: hubMailPrefs.digest,
        agentJob: hubMailPrefs.agentJob,
      })
      .from(hubMailPrefs)
      .where(eq(hubMailPrefs.userId, ctx.session.user.id))
      .limit(1);

    const resolved = resolvePrefs(rows as OptoutRow[]);
    return {
      globalDigestOptOut: resolved.globalDigestOptOut,
      digestOptOutCommunityIds: [...resolved.digestOptOutCommunityIds],
      broadcastOptOutCommunityIds: [...resolved.broadcastOptOutCommunityIds],
      digestOptOutSections: DIGEST_SECTIONS.filter((section) =>
        resolved.digestOptOutSections.has(section),
      ),
      hubMail: resolveHubMailPrefs(hubRow ?? null),
    };
  }),

  /** Toggle one opt-out. optedOut=true inserts (if absent); false deletes.
   *
   * Valid combinations:
   *   communityId=null  + category="digest"         → global digest opt-out
   *   communityId=null  + category="digest:<section>" → section opt-out
   *   communityId=<id>  + category="digest"         → per-community digest opt-out
   *   communityId=<id>  + category="broadcast"      → per-community broadcast opt-out
   *
   * Invalid (rejected):
   *   communityId=null  + category="broadcast"      → no global broadcast opt-out
   *   communityId=<id>  + category="digest:<section>" → sections are global
   *   communityId=""                                 → empty string is not a community id
   */
  setOptout: protectedProcedure
    .input(
      z
        .object({
          communityId: z.string().min(1).nullable(),
          category: z.enum(OPTOUT_CATEGORIES),
          optedOut: z.boolean(),
        })
        .superRefine((val, ctx) => {
          const message = optoutInputError(val);
          if (!message) return;
          ctx.addIssue({
            code: "custom",
            message,
            path: ["category"],
          });
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const match = and(
        eq(notificationOptouts.userId, userId),
        input.communityId === null
          ? isNull(notificationOptouts.communityId)
          : eq(notificationOptouts.communityId, input.communityId),
        eq(notificationOptouts.category, input.category),
      );

      if (input.optedOut) {
        await ctx.db
          .insert(notificationOptouts)
          .values({
            userId,
            communityId: input.communityId,
            category: input.category,
          })
          .onConflictDoNothing();
      } else {
        await ctx.db.delete(notificationOptouts).where(match);
      }
      return { ok: true };
    }),

  /** Toggle one Hub notification-mail case. DM and mention mail send today. */
  setHubMail: protectedProcedure
    .input(
      z.object({
        case: hubMailCaseSchema,
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db
        .insert(hubMailPrefs)
        .values({
          userId,
          ...DEFAULT_HUB_MAIL_PREFS,
          [input.case]: input.enabled,
        })
        .onConflictDoUpdate({
          target: hubMailPrefs.userId,
          set: { [input.case]: input.enabled },
        });
      return { ok: true };
    }),
});
