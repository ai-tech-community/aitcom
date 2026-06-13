// Participant workspace (Plan 4): member-gated reads + mutations over a team's
// competitive work grid. Humans act as peers to commissioned agents — a cell is
// claimed/authored by an agent OR a user, never both. Organizer verification
// (work-grid verifyCellResult) and finalizeHackathon scoring are unchanged: they
// count VERIFIED results regardless of author. Each forward action (assign, claim, report) and organizer
// verification appends one teamActivityEvent for the feed; releaseCell (a
// claimed→pending revert) intentionally does not.

import { z } from "zod";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  workGrids,
  workCells,
  workCellResults,
  teamActivityEvents,
  teamPresence,
  memberProfiles,
  teams,
} from "@/server/db/schema";
import { ownerOnTeam } from "@/server/hackathon/team-membership";
import { cellHeatState } from "@/server/hackathon/cell-state";
import { appendActivity } from "@/server/hackathon/activity";
import {
  canEditCellProgress,
  isTaskProgressStatus,
  TASK_PROGRESS_STATUSES,
} from "@/server/hackathon/task-progress";

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

/**
 * Resolve a team's single competitive grid id, or throw NOT_FOUND.
 * With `mustBeActive` (state-changing claim/report/release), an inactive grid
 * throws CONFLICT — gate parity with the agent claimCell path in work-grid.ts;
 * reads (cells, activity) keep working regardless of grid status.
 */
async function requireTeamGridId(
  db: typeof import("@/server/db").db,
  teamId: string,
  opts?: { mustBeActive?: boolean },
): Promise<string> {
  const [grid] = await db
    .select({ id: workGrids.id, status: workGrids.status })
    .from(workGrids)
    .where(and(eq(workGrids.teamId, teamId), eq(workGrids.mode, "competitive")))
    .limit(1);
  if (!grid) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This team has no work grid yet (rosters not locked).",
    });
  }
  if (opts?.mustBeActive && grid.status !== "active") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Grid is not active",
    });
  }
  return grid.id;
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
          .where(
            and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)),
          )
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

  /**
   * Set a cell's manual, kanban-style progress status (and optional note).
   * Informational only — does NOT touch verification or score. Editable by the
   * cell's current claimant or the team captain.
   */
  updateCellProgress: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        teamId: z.string(),
        status: z.enum(TASK_PROGRESS_STATUSES),
        note: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      // Defence in depth: the input is already z.enum-constrained.
      if (!isTaskProgressStatus(input.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid status" });
      }

      const [team] = await ctx.db
        .select({ captainId: teams.captainId })
        .from(teams)
        .where(eq(teams.id, input.teamId));
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      const [cell] = await ctx.db
        .select({ claimedByUserId: workCells.claimedByUserId })
        .from(workCells)
        .where(
          and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)),
        );
      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      if (
        !canEditCellProgress({
          userId,
          captainId: team.captainId,
          claimedByUserId: cell.claimedByUserId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the cell's claimant or the team captain can update its progress.",
        });
      }

      const [updated] = await ctx.db
        .update(workCells)
        .set({ progressStatus: input.status, progressNote: input.note ?? null })
        .where(and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)))
        .returning();
      return updated;
    }),

  /**
   * Human claim — the participant analogue of work-grid claimCell. Atomic flip
   * pending/requeued → claimed, locking the cell to this user. Re-arms a fresh
   * deadline from the cell's deadlineMinutes (mirrors the agent path). Member-
   * gated; the cell must belong to this team's grid.
   */
  claimCellAsMember: protectedProcedure
    .input(z.object({ cellId: z.string(), teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId, {
        mustBeActive: true,
      });

      const [cell] = await ctx.db
        .select()
        .from(workCells)
        .where(
          and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)),
        )
        .limit(1);
      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      return ctx.db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(workCells)
          .set({
            status: "claimed",
            claimedByUserId: userId,
            claimedBy: null,
            claimedAt: new Date(),
            deadline:
              cell.deadlineMinutes !== null
                ? new Date(Date.now() + cell.deadlineMinutes * 60_000)
                : null,
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
        await appendActivity(tx, {
          teamId: input.teamId,
          cellId: input.cellId,
          actorUserId: userId,
          type: "claimed",
        });
        return claimed;
      });
    }),

  /** Release a cell this member claimed (back to pending). Own-claim only. */
  releaseCell: protectedProcedure
    .input(z.object({ cellId: z.string(), teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId, {
        mustBeActive: true,
      });

      const [released] = await ctx.db
        .update(workCells)
        .set({
          status: "pending",
          claimedByUserId: null,
          claimedAt: null,
          deadline: null,
        })
        .where(
          and(
            eq(workCells.id, input.cellId),
            eq(workCells.gridId, gridId),
            eq(workCells.status, "claimed"),
            eq(workCells.claimedByUserId, userId),
          ),
        )
        .returning();
      if (!released) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have not claimed this cell.",
        });
      }
      return released;
    }),

  /**
   * Human report — the participant analogue of work-grid submitCellResult. Flips
   * a cell THIS member has claimed claimed → completed and inserts a user-
   * authored result (verificationOutcome="pending", awaiting organizer verify).
   * The self-guarding UPDATE matches only a cell still claimed by this user, so
   * there is no TOCTOU window.
   */
  reportResult: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        teamId: z.string(),
        output: z.string().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId, {
        mustBeActive: true,
      });

      return ctx.db.transaction(async (tx) => {
        const [completed] = await tx
          .update(workCells)
          .set({ status: "completed" })
          .where(
            and(
              eq(workCells.id, input.cellId),
              eq(workCells.gridId, gridId),
              eq(workCells.status, "claimed"),
              eq(workCells.claimedByUserId, userId),
            ),
          )
          .returning();
        if (!completed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This cell is not claimed by you.",
          });
        }

        await tx
          .insert(workCellResults)
          .values({
            cellId: input.cellId,
            userId,
            agentId: null,
            output: input.output,
            verificationOutcome: "pending",
          })
          .onConflictDoNothing({ target: workCellResults.cellId });

        await appendActivity(tx, {
          teamId: input.teamId,
          cellId: input.cellId,
          actorUserId: userId,
          type: "reported",
        });
        return completed;
      });
    }),

  /** Recent activity for the team feed (newest first). Member-gated. */
  activity: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      return ctx.db
        .select()
        .from(teamActivityEvents)
        .where(eq(teamActivityEvents.teamId, input.teamId))
        .orderBy(desc(teamActivityEvents.createdAt))
        .limit(input.limit);
    }),

  /** Members seen within the freshness window are "online". Member-gated. */
  presence: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      const since = new Date(Date.now() - 45_000); // 45s freshness window
      const rows = await ctx.db
        .select({
          userId: teamPresence.userId,
          lastSeenAt: teamPresence.lastSeenAt,
          displayName: memberProfiles.displayName,
        })
        .from(teamPresence)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, teamPresence.userId),
        )
        .where(
          and(
            eq(teamPresence.teamId, input.teamId),
            gte(teamPresence.lastSeenAt, since),
          ),
        );
      return rows;
    }),

  /** Heartbeat — upsert the caller's presence for the team. Member-gated. */
  heartbeat: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      await ctx.db
        .insert(teamPresence)
        .values({ teamId: input.teamId, userId, lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: [teamPresence.teamId, teamPresence.userId],
          set: { lastSeenAt: new Date() },
        });
      return { ok: true };
    }),
});
