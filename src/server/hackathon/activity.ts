// Team activity feed appends (Plan 4): one row per forward action on a
// competitive grid's cells — assign/claim/report by a human or agent, and
// organizer verification outcomes. Shared by the team-workspace (human) and
// work-grid (agent + verify) routers so every cell state transition lands in
// the same feed. The actor is a user XOR an agent, mirroring ADR-0033.

import { teamActivityEvents } from "@/server/db/schema";

/** A db client or an open transaction — appends join an existing tx when one exists. */
type DbOrTx =
  | typeof import("@/server/db").db
  | Parameters<
      Parameters<(typeof import("@/server/db").db)["transaction"]>[0]
    >[0];

/** Append one activity event (inside the same tx as the action when there is one). */
export async function appendActivity(
  db: DbOrTx,
  args: {
    teamId: string;
    cellId: string | null;
    actorUserId?: string | null;
    actorAgentId?: string | null;
    type: "assigned" | "claimed" | "reported" | "verified" | "failed";
  },
) {
  await db.insert(teamActivityEvents).values({
    teamId: args.teamId,
    cellId: args.cellId,
    actorUserId: args.actorUserId ?? null,
    actorAgentId: args.actorAgentId ?? null,
    type: args.type,
  });
}
