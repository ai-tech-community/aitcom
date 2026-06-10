// Participant workspace (Plan 4): member-gated reads + mutations over a team's
// competitive work grid. Humans act as peers to commissioned agents — a cell is
// claimed/authored by an agent OR a user, never both. Organizer verification
// (work-grid verifyCellResult) and finalizeHackathon scoring are unchanged: they
// count VERIFIED results regardless of author. Every state-changing action
// appends one teamActivityEvent for the feed.

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  workGrids,
  workCells,
  workCellResults,
  teamActivityEvents,
} from "@/server/db/schema";
import { ownerOnTeam } from "@/server/hackathon/team-membership";
import { cellHeatState } from "@/server/hackathon/cell-state";

/** Throw FORBIDDEN unless the caller is an active member of the team. */
async function requireTeamMember(
  db: typeof import("@/server/db").db,
  userId: string,
  teamId: string,
) {
  if (!(await ownerOnTeam(db, userId, teamId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this team.",
    });
  }
}

/** Resolve a team's single competitive grid id, or throw NOT_FOUND. */
async function requireTeamGridId(
  db: typeof import("@/server/db").db,
  teamId: string,
): Promise<string> {
  const [grid] = await db
    .select({ id: workGrids.id })
    .from(workGrids)
    .where(and(eq(workGrids.teamId, teamId), eq(workGrids.mode, "competitive")))
    .limit(1);
  if (!grid) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This team has no work grid yet (rosters not locked).",
    });
  }
  return grid.id;
}

type Tx = Parameters<
  Parameters<(typeof import("@/server/db").db)["transaction"]>[0]
>[0];

/** Append one activity event (call inside the same tx as the action). */
async function appendActivity(
  tx: Tx,
  args: {
    teamId: string;
    cellId: string | null;
    actorUserId?: string | null;
    actorAgentId?: string | null;
    type: "assigned" | "claimed" | "reported" | "verified" | "failed";
  },
) {
  await tx.insert(teamActivityEvents).values({
    teamId: args.teamId,
    cellId: args.cellId,
    actorUserId: args.actorUserId ?? null,
    actorAgentId: args.actorAgentId ?? null,
    type: args.type,
  });
}

export const teamWorkspaceRouter = createTRPCRouter({
  /**
   * The team's grid cells WITH content + latest result + assignee/claimant, for
   * the workspace heatmap and drawers. Member-gated (rivals never see content).
   */
  cells: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      const cells = await ctx.db
        .select()
        .from(workCells)
        .where(eq(workCells.gridId, gridId));

      const cellIds = cells.map((c) => c.id);
      const results =
        cellIds.length > 0
          ? await ctx.db
              .select()
              .from(workCellResults)
              .where(inArray(workCellResults.cellId, cellIds))
          : [];
      const resultByCell = new Map(results.map((r) => [r.cellId, r]));

      return cells.map((cell) => {
        const result = resultByCell.get(cell.id) ?? null;
        return {
          ...cell,
          heatState: cellHeatState(
            cell.status,
            result?.verificationOutcome ?? null,
          ),
          result,
        };
      });
    }),

  /** Soft-assign a cell to a teammate (or clear it). No lock — planning only. */
  assignCell: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        teamId: z.string(),
        userId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      // The assignee, when set, must themselves be a team member.
      if (input.userId !== null) {
        await requireTeamMember(ctx.db, input.userId, input.teamId);
      }

      return ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(workCells)
          .set({ assignedToUserId: input.userId })
          .where(and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)))
          .returning();
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
        }
        await appendActivity(tx, {
          teamId: input.teamId,
          cellId: input.cellId,
          actorUserId: ctx.session.user.id,
          type: "assigned",
        });
        return updated;
      });
    }),
});
