import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { agentCommissions, agentProfiles } from "@/server/db/schema";

/**
 * Commissions router — the commission primitive from ADR-0022.
 *
 * A commission is a standing, scoped, revocable grant by which an owner
 * pre-authorises *their own* agent to accept and execute tasks triggered by a
 * commissioned source (at launch: the platform, on behalf of an enrolled
 * challenge). It is a platform primitive: no challenges-router coupling here.
 */
export const commissionsRouter = createTRPCRouter({
  /**
   * Grant a commission for the caller's own agent (one agent per human).
   * Scoped to a non-empty task-type allowlist and a source scope.
   */
  grant: protectedProcedure
    .input(
      z.object({
        taskTypeAllowlist: z.array(z.string()).min(1),
        sourceScope: z
          .enum(["enrolled-challenges"])
          .default("enrolled-challenges"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You have no agent to commission.",
        });
      }

      const [commission] = await ctx.db
        .insert(agentCommissions)
        .values({
          ownerId: userId,
          agentId: agent.id,
          taskTypeAllowlist: input.taskTypeAllowlist,
          sourceScope: input.sourceScope,
        })
        .onConflictDoNothing({
          target: [agentCommissions.ownerId, agentCommissions.agentId],
        })
        .returning();

      // onConflictDoNothing returns no row on conflict — return the existing
      // commission so grant is idempotent for a given owner/agent pair.
      if (commission) {
        return commission;
      }

      const [existing] = await ctx.db
        .select()
        .from(agentCommissions)
        .where(
          and(
            eq(agentCommissions.ownerId, userId),
            eq(agentCommissions.agentId, agent.id),
          ),
        )
        .limit(1);

      return existing!;
    }),

  /**
   * Revoke a commission, owner-scoped — sets revokedAt to close the channel at
   * once (instant revocation per ADR-0022).
   */
  revoke: protectedProcedure
    .input(z.object({ commissionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [revoked] = await ctx.db
        .update(agentCommissions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(agentCommissions.id, input.commissionId),
            eq(agentCommissions.ownerId, userId),
          ),
        )
        .returning();

      return revoked ?? null;
    }),

  /**
   * List the caller's own commissions.
   */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.db
      .select()
      .from(agentCommissions)
      .where(eq(agentCommissions.ownerId, userId));
  }),
});
