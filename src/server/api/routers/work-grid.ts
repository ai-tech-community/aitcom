import { z } from "zod";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  agentProcedure,
  protectedProcedure,
  requireScope,
  requireOwner,
  requireConfigAdmin,
} from "@/server/api/trpc";
import {
  workGrids,
  workCells,
  workCellResults,
  agentCommissions,
  communityMemberships,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import type { CommunityRole } from "@/server/communities/role-utils";
import { awardCommissionedCellXp } from "@/server/agent/activity";
import { isTaskTypeAllowed } from "./task-allowlist";

/**
 * Work-grid router — the runtime of a [[work-grid]] from ADR-0023.
 *
 * Dispatch is a **claimable pull queue, not a push**: a cell sits in the queue
 * until a commissioned agent claims it; an offline agent catches it on its next
 * session. The result return path is an **outbound MCP tool call**
 * (`submit-cell-result`), never a webhook — agents are MCP clients, so a
 * laptop-bound CLI that can receive no inbound webhook still participates.
 *
 * AIT provides only plumbing — queue, claim, deadline/requeue, transport — and
 * performs no cognition. The commission envelope (ADR-0022) is enforced before
 * an agent ever sees a cell: a cell outside the task-type allowlist or in a
 * non-collaborative grid is filtered out before exposure.
 */

/**
 * Load the agent's single active (non-revoked) commission, or throw FORBIDDEN.
 * The commission is the front-loaded consent gate from ADR-0022.
 */
async function requireActiveCommission(
  db: typeof import("@/server/db").db,
  agentId: string,
) {
  const [commission] = await db
    .select()
    .from(agentCommissions)
    .where(
      and(
        eq(agentCommissions.agentId, agentId),
        isNull(agentCommissions.revokedAt),
      ),
    )
    .limit(1);

  if (!commission) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active commission for this agent",
    });
  }

  return commission;
}

export const workGridRouter = createTRPCRouter({
  /**
   * List cells this agent may claim. Only pending/requeued cells whose taskType
   * is in the commission allowlist and whose grid mode is "collaborative" are
   * returned — cells outside the envelope are filtered out before exposure.
   */
  listClaimable: agentProcedure
    .input(z.object({ gridId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "commission:claim-cell");
      requireOwner(ctx.agent.ownerId);

      const commission = await requireActiveCommission(
        ctx.db,
        ctx.agent.agentId,
      );

      // Empty allowlist means nothing is claimable.
      if (commission.taskTypeAllowlist.length === 0) {
        return [];
      }

      const conditions = [
        eq(workGrids.mode, "collaborative"),
        inArray(workCells.status, ["pending", "requeued"]),
        inArray(workCells.taskType, commission.taskTypeAllowlist),
      ];
      if (input.gridId) {
        conditions.push(eq(workCells.gridId, input.gridId));
      }

      const rows = await ctx.db
        .select({ cell: workCells })
        .from(workCells)
        .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
        .where(and(...conditions));

      return rows.map((r) => r.cell);
    }),

  /**
   * Atomically claim a cell. Verifies an active commission and that the cell's
   * task type is in the allowlist, then flips status pending/requeued → claimed
   * in a single UPDATE. Throws CONFLICT if another agent claimed it first.
   */
  claimCell: agentProcedure
    .input(z.object({ cellId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "commission:claim-cell");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const commission = await requireActiveCommission(
        ctx.db,
        ctx.agent.agentId,
      );

      const [cell] = await ctx.db
        .select()
        .from(workCells)
        .where(eq(workCells.id, input.cellId))
        .limit(1);

      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      // Task-type allowlist enforced before the agent claims the cell.
      if (!isTaskTypeAllowed(commission.taskTypeAllowlist, cell.taskType)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Task type "${cell.taskType}" is outside the commission allowlist`,
        });
      }

      // Atomic claim: only succeeds if the cell is still pending/requeued.
      const [claimed] = await ctx.db
        .update(workCells)
        .set({
          status: "claimed",
          claimedBy: ctx.agent.agentId,
          claimedAt: new Date(),
        })
        .where(
          and(
            eq(workCells.id, input.cellId),
            inArray(workCells.status, ["pending", "requeued"]),
          ),
        )
        .returning();

      if (!claimed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cell already claimed",
        });
      }

      // ownerId is referenced to keep the claim owner-scoped per ADR-0022.
      void ownerId;

      return claimed;
    }),

  /**
   * Return a result for a claimed cell — the **outbound** return path (no
   * webhook). Verifies the cell is claimed by this agent, inserts a result row
   * (verificationOutcome="pending"), and marks the cell completed.
   */
  submitCellResult: agentProcedure
    .input(z.object({ cellId: z.string(), output: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "commission:submit-result");
      requireOwner(ctx.agent.ownerId);

      const [cell] = await ctx.db
        .select()
        .from(workCells)
        .where(eq(workCells.id, input.cellId))
        .limit(1);

      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      if (cell.status !== "claimed" || cell.claimedBy !== ctx.agent.agentId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cell is not claimed by this agent",
        });
      }

      await ctx.db
        .insert(workCellResults)
        .values({
          cellId: input.cellId,
          agentId: ctx.agent.agentId,
          output: input.output,
          verificationOutcome: "pending",
        })
        .onConflictDoNothing({
          target: [workCellResults.cellId, workCellResults.agentId],
        });

      const [completed] = await ctx.db
        .update(workCells)
        .set({ status: "completed" })
        .where(eq(workCells.id, input.cellId))
        .returning();

      return completed ?? cell;
    }),

  /**
   * Verify a submitted cell result and, on a *verified* outcome, award the
   * commission **owner** (the human who commissioned their agent) XP scaled by
   * the cell's `verificationMode` — strong verification (consensus/test) pays
   * full, a bare self-report a small fraction, failed/pending nothing
   * (verification-gated XP, ADR-0022). Commissioned completions are tagged
   * `metadata.isCommissioned=true` so they never count toward activation
   * signals. XP is Hub-global (awardXp updates the member profile, no
   * community scoping).
   *
   * Owner-scoped: only the cell's grid owner (challenge sponsor / community
   * config-admin) may verify, reusing the createCollaborativeGrid auth pattern.
   */
  verifyCellResult: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        outcome: z.enum(["verified", "failed"]),
        verificationDetails: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [cell] = await ctx.db
        .select()
        .from(workCells)
        .where(eq(workCells.id, input.cellId))
        .limit(1);
      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      const [grid] = await ctx.db
        .select()
        .from(workGrids)
        .where(eq(workGrids.id, cell.gridId))
        .limit(1);
      if (!grid) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Grid not found" });
      }

      // Authorisation mirrors createCollaborativeGrid: the challenge sponsor for
      // a challenge-scoped grid, or a community config-admin otherwise.
      if (grid.challengeId !== null) {
        const payload = await getPayloadClient();
        let challenge;
        try {
          challenge = await payload.findByID({
            collection: "challenges",
            id: grid.challengeId,
            depth: 0,
          });
        } catch {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Challenge not found",
          });
        }
        if (challenge.creatorId !== userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the challenge sponsor can verify this cell",
          });
        }
      } else if (grid.communityId !== null) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, grid.communityId),
            eq(communityMemberships.userId, userId),
          ),
        });
        const role = (
          membership?.status === "active" ? membership.role : null
        ) as CommunityRole | null;
        requireConfigAdmin(role);
      }

      // Transition the pending result for this cell to the verified/failed
      // outcome (idempotent: only flips a still-pending row).
      const [result] = await ctx.db
        .update(workCellResults)
        .set({
          verificationOutcome: input.outcome,
          verificationDetails: input.verificationDetails,
          verifiedAt: new Date(),
        })
        .where(
          and(
            eq(workCellResults.cellId, input.cellId),
            eq(workCellResults.verificationOutcome, "pending"),
          ),
        )
        .returning();

      if (!result) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "No pending result to verify for this cell",
        });
      }

      await ctx.db
        .update(workCells)
        .set({
          status: input.outcome === "verified" ? "completed" : "failed",
        })
        .where(eq(workCells.id, input.cellId));

      // Resolve the OWNER (the human who commissioned the agent) from the
      // result's agent's active commission. XP accrues to the owner, not the
      // agent (ADR-0022 attribution: "X's agent, commissioned").
      const [commission] = await ctx.db
        .select({ ownerId: agentCommissions.ownerId })
        .from(agentCommissions)
        .where(
          and(
            eq(agentCommissions.agentId, result.agentId),
            isNull(agentCommissions.revokedAt),
          ),
        )
        .limit(1);

      let xpAwarded = 0;
      if (commission) {
        xpAwarded = await awardCommissionedCellXp(ctx.db, {
          ownerId: commission.ownerId,
          cellId: cell.id,
          gridId: grid.id,
          verificationMode: cell.verificationMode,
          verificationOutcome: input.outcome,
          communityId: grid.communityId,
        });
      }

      return { result, outcome: input.outcome, xpAwarded };
    }),

  /**
   * Requeue cells whose deadline has passed — a sleepy grid self-heals
   * (deadline → requeue, ADR-0023). Exposed for a cron caller. Returns the
   * requeued cells.
   */
  requeueExpired: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db
      .update(workCells)
      .set({ status: "requeued", claimedBy: null, claimedAt: null })
      .where(
        and(
          eq(workCells.status, "claimed"),
          lt(workCells.deadline, new Date()),
        ),
      )
      .returning();
  }),

  /**
   * Create a **collaborative** [[work-grid]] and its [[work-cell]]s from a
   * challenge (or a bare community-scoped grid). One pending cell per input
   * objective drains into the claimable pull queue (ADR-0023); each cell becomes
   * claimable by any commissioned agent in the community whose allowlist matches
   * (collaborative eligibility — ADR-0022/0023).
   *
   * Authorisation reuses the config-admin pattern: a challenge-scoped grid
   * requires the caller to own/sponsor the challenge (its `creatorId`); a
   * community-scoped grid requires owner/admin role in that community.
   */
  createCollaborativeGrid: protectedProcedure
    .input(
      z.object({
        challengeId: z.number().optional(),
        communityId: z.string().optional(),
        cells: z
          .array(
            z.object({
              taskType: z.string(),
              verificationMode: z
                .enum([
                  "platform-action",
                  "test",
                  "self-report",
                  "peer-review",
                  "consensus",
                ])
                .default("self-report"),
              deadlineMinutes: z.number().int().positive().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Challenge-scoped grids: verify the caller owns/sponsors the challenge.
      if (input.challengeId !== undefined) {
        const payload = await getPayloadClient();
        let challenge;
        try {
          challenge = await payload.findByID({
            collection: "challenges",
            id: input.challengeId,
            depth: 0,
          });
        } catch {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Challenge not found",
          });
        }
        if (challenge.creatorId !== userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the challenge sponsor can create a grid for it",
          });
        }
      } else if (input.communityId !== undefined) {
        // Community-scoped grids: require owner/admin role in that community.
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, input.communityId),
            eq(communityMemberships.userId, userId),
          ),
        });
        const role = (
          membership?.status === "active" ? membership.role : null
        ) as CommunityRole | null;
        requireConfigAdmin(role);
      }

      const [grid] = await ctx.db
        .insert(workGrids)
        .values({
          mode: "collaborative",
          status: "active",
          challengeId: input.challengeId,
          communityId: input.communityId,
        })
        .returning();

      if (!grid) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create grid",
        });
      }

      const now = Date.now();
      const created = await ctx.db
        .insert(workCells)
        .values(
          input.cells.map((cell) => ({
            gridId: grid.id,
            taskType: cell.taskType,
            verificationMode: cell.verificationMode,
            status: "pending" as const,
            deadline:
              cell.deadlineMinutes !== undefined
                ? new Date(now + cell.deadlineMinutes * 60_000)
                : null,
          })),
        )
        .returning({ id: workCells.id });

      return { gridId: grid.id, cellIds: created.map((c) => c.id) };
    }),

  /**
   * Return a grid with its cells and any results — for the owner UI / inspection.
   */
  getGrid: protectedProcedure
    .input(z.object({ gridId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [grid] = await ctx.db
        .select()
        .from(workGrids)
        .where(eq(workGrids.id, input.gridId))
        .limit(1);

      if (!grid) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Grid not found" });
      }

      const cells = await ctx.db
        .select()
        .from(workCells)
        .where(eq(workCells.gridId, grid.id));

      const cellIds = cells.map((c) => c.id);
      const results =
        cellIds.length > 0
          ? await ctx.db
              .select()
              .from(workCellResults)
              .where(inArray(workCellResults.cellId, cellIds))
          : [];

      return { grid, cells, results };
    }),
});
